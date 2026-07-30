"""Password recovery by e-mail code — "esqueci minha senha".

Flow: request (email -> 6-digit code sent by e-mail) -> confirm (code ->
short-lived reset_token) -> complete (reset_token + new_password).

State lives in the cache (Redis in production, LocMem locally) rather than
a DB model — same pattern used by telegram_bot's link-code flow
(telegram_bot/api_views.py), and appropriate here since these records are
short-lived and disposable.
"""

import logging
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.throttles import (
    PasswordResetCompleteThrottle,
    PasswordResetConfirmThrottle,
    PasswordResetRequestThrottle,
)
from users.serializers import (
    PasswordResetCompleteSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
)
from users.services import send_password_reset_email

User = get_user_model()
logger = logging.getLogger(__name__)

CODE_TTL_SECONDS = 15 * 60
CODE_CACHE_PREFIX = "password_reset_code:"
MAX_CODE_ATTEMPTS = 5

TICKET_TTL_SECONDS = 10 * 60
TICKET_CACHE_PREFIX = "password_reset_ticket:"

GENERIC_SENT_DETAIL = "Se o e-mail informado estiver cadastrado, um código de confirmação foi enviado."
INVALID_CODE_DETAIL = "Código inválido ou expirado."


def _code_cache_key(email: str) -> str:
    return f"{CODE_CACHE_PREFIX}{email.strip().lower()}"


def _blacklist_all_tokens_for_user(user) -> None:
    """Forces logout on every device after a password reset."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


class PasswordResetRequestView(APIView):
    """POST /api/v1/auth/password-reset/request/ {email}

    Always returns a generic success message — never reveals whether the
    e-mail is registered, to avoid user enumeration.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRequestThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        matches = User.objects.filter(email__iexact=email, is_active=True)
        if matches.count() == 1:
            user = matches.first()
            code = f"{secrets.randbelow(1_000_000):06d}"
            cache.set(
                _code_cache_key(email),
                {"user_id": user.id, "code": code, "attempts": 0},
                timeout=CODE_TTL_SECONDS,
            )
            send_password_reset_email(user, code, ttl_minutes=CODE_TTL_SECONDS // 60)

        return Response({"detail": GENERIC_SENT_DETAIL}, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    """POST /api/v1/auth/password-reset/confirm/ {email, code}

    Returns a one-time reset_token on success, to be submitted along with
    the new password to the complete endpoint.
    """

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetConfirmThrottle]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]
        code = serializer.validated_data["code"]

        cache_key = _code_cache_key(email)
        payload = cache.get(cache_key)
        if not payload:
            return Response({"detail": INVALID_CODE_DETAIL}, status=status.HTTP_400_BAD_REQUEST)

        if payload["attempts"] >= MAX_CODE_ATTEMPTS:
            cache.delete(cache_key)
            return Response(
                {"detail": "Número máximo de tentativas excedido. Solicite um novo código."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not secrets.compare_digest(payload["code"], code):
            payload["attempts"] += 1
            if payload["attempts"] >= MAX_CODE_ATTEMPTS:
                cache.delete(cache_key)
                return Response(
                    {"detail": "Número máximo de tentativas excedido. Solicite um novo código."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            cache.set(cache_key, payload, timeout=CODE_TTL_SECONDS)
            return Response({"detail": INVALID_CODE_DETAIL}, status=status.HTTP_400_BAD_REQUEST)

        cache.delete(cache_key)
        ticket = secrets.token_urlsafe(32)
        cache.set(
            f"{TICKET_CACHE_PREFIX}{ticket}",
            {"user_id": payload["user_id"]},
            timeout=TICKET_TTL_SECONDS,
        )
        return Response({"detail": "Código confirmado.", "reset_token": ticket}, status=status.HTTP_200_OK)


class PasswordResetCompleteView(APIView):
    """POST /api/v1/auth/password-reset/complete/ {reset_token, new_password, new_password_confirm}"""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetCompleteThrottle]

    def post(self, request):
        serializer = PasswordResetCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.validated_data["reset_token"]
        new_password = serializer.validated_data["new_password"]

        ticket_key = f"{TICKET_CACHE_PREFIX}{ticket}"
        payload = cache.get(ticket_key)
        if not payload:
            return Response(
                {"detail": "Sessão de recuperação expirada. Solicite um novo código."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(pk=payload["user_id"], is_active=True).first()
        if not user:
            cache.delete(ticket_key)
            return Response({"detail": "Usuário não encontrado."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            return Response({"new_password": exc.messages}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        cache.delete(ticket_key)
        _blacklist_all_tokens_for_user(user)

        logger.info("Senha redefinida via recuperação por e-mail: user_id=%s", user.pk)
        return Response(
            {"detail": "Senha alterada com sucesso. Faça login com a nova senha."},
            status=status.HTTP_200_OK,
        )


class DebugPasswordResetCodeView(APIView):
    """GET /api/v1/auth/password-reset/debug-code/?email=...

    Returns the pending code for an e-mail so the Playwright E2E suite can
    complete the reset flow without a real mailbox. Never registered unless
    settings.E2E_TESTING is on (see core/api_urls.py) — off by default and
    hard-blocked on a real Heroku dyno regardless of config vars.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        email = request.query_params.get("email", "")
        payload = cache.get(_code_cache_key(email))
        if not payload:
            return Response({"detail": "Nenhum código pendente para este e-mail."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"code": payload["code"]})
