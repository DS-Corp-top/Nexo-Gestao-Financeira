import logging
import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import IntegrityError
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Account
from common.api_mixins import get_user_tenant
from transactions.models import Transaction

from .models import TelegramLink
from .serializers import TelegramLinkSerializer
from .services import parse_transaction_message, send_telegram_message

logger = logging.getLogger(__name__)

LINK_CODE_TTL_SECONDS = 600
LINK_CODE_CACHE_PREFIX = "telegram_link_code:"


class TelegramLinkStatusView(APIView):
    """GET retorna o vínculo atual do usuário autenticado; DELETE desvincula."""

    def get(self, request):
        link = (
            TelegramLink.objects.filter(user=request.user)
            .select_related("default_account")
            .first()
        )
        if not link:
            return Response({"linked": False})
        data = TelegramLinkSerializer(link).data
        data["linked"] = True
        return Response(data)

    def delete(self, request):
        TelegramLink.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TelegramLinkCodeView(APIView):
    """POST {account_id} gera um código de vínculo de uso único (10 min)."""

    def post(self, request):
        account_id = request.data.get("account_id")
        tenant = get_user_tenant(request.user, request)
        account = Account.objects.filter(pk=account_id, tenant=tenant).first()
        if not account:
            return Response(
                {"detail": "Conta inválida."}, status=status.HTTP_400_BAD_REQUEST
            )

        code = secrets.token_hex(4).upper()
        cache.set(
            f"{LINK_CODE_CACHE_PREFIX}{code}",
            {
                "user_id": request.user.id,
                "tenant_id": tenant.id if tenant else None,
                "account_id": account.id,
            },
            timeout=LINK_CODE_TTL_SECONDS,
        )
        bot_username = settings.TELEGRAM_BOT_USERNAME
        deep_link = f"https://t.me/{bot_username}?start={code}" if bot_username else None
        return Response(
            {"code": code, "deep_link": deep_link, "expires_in": LINK_CODE_TTL_SECONDS}
        )


class TelegramWebhookView(APIView):
    """Recebe as updates do bot do Telegram (configurado via setWebhook)."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        expected_secret = settings.TELEGRAM_WEBHOOK_SECRET
        if expected_secret and request.headers.get("X-Telegram-Bot-Api-Secret-Token") != expected_secret:
            return Response(status=status.HTTP_403_FORBIDDEN)

        message = request.data.get("message") or {}
        chat = message.get("chat") or {}
        chat_id = chat.get("id")
        text = (message.get("text") or "").strip()

        if not chat_id or not text:
            return Response(status=status.HTTP_200_OK)

        if text.startswith("/start"):
            self._handle_link(chat_id, text)
            return Response(status=status.HTTP_200_OK)

        self._handle_transaction(chat_id, text)
        return Response(status=status.HTTP_200_OK)

    def _handle_link(self, chat_id, text):
        parts = text.split(maxsplit=1)
        code = parts[1].strip().upper() if len(parts) > 1 else ""
        if not code:
            send_telegram_message(
                chat_id,
                "Gere um link de vínculo em Configurações > Telegram no app Nexo e toque nele pra conectar sua conta.",
            )
            return

        cache_key = f"{LINK_CODE_CACHE_PREFIX}{code}"
        payload = cache.get(cache_key)
        if not payload:
            send_telegram_message(
                chat_id, "Código inválido ou expirado. Gere um novo em Configurações > Telegram."
            )
            return

        user = get_user_model().objects.filter(pk=payload["user_id"]).first()
        account = Account.objects.filter(pk=payload["account_id"]).first()
        if not user or not account:
            send_telegram_message(chat_id, "Não foi possível concluir o vínculo. Tente novamente.")
            return

        try:
            TelegramLink.objects.update_or_create(
                user=user,
                defaults={
                    "tenant_id": payload["tenant_id"],
                    "chat_id": chat_id,
                    "default_account": account,
                },
            )
        except IntegrityError:
            logger.warning("chat_id=%s já vinculado a outro usuário.", chat_id)
            send_telegram_message(
                chat_id, "Este chat do Telegram já está vinculado a outra conta do Nexo."
            )
            return

        cache.delete(cache_key)
        send_telegram_message(
            chat_id,
            (
                f'✅ Conta vinculada! Envie mensagens como "Mercado 89,90" pra lançar despesas em '
                f'{account.name} (conta padrão). Pra usar outra conta, cite o nome dela na mensagem, '
                f'ex: "Mercado 89,90 {account.name}".'
            ),
        )

    def _handle_transaction(self, chat_id, text):
        link = (
            TelegramLink.objects.filter(chat_id=chat_id)
            .select_related("tenant", "user", "default_account")
            .first()
        )
        if not link:
            send_telegram_message(
                chat_id,
                "Sua conta ainda não está vinculada. Gere um link em Configurações > Telegram no app Nexo.",
            )
            return

        if not link.default_account:
            send_telegram_message(
                chat_id,
                "A conta padrão vinculada foi removida. Gere um novo vínculo em Configurações > Telegram.",
            )
            return

        parsed = parse_transaction_message(text, tenant=link.tenant)
        if parsed is None:
            send_telegram_message(
                chat_id,
                "Não encontrei um valor na mensagem. Envie assim: Categoria valor (ex: Mercado 89,90).",
            )
            return

        account = parsed["account"] or link.default_account

        transaction = Transaction.objects.create(
            user=link.user,
            tenant=link.tenant,
            transaction_type=parsed["transaction_type"],
            amount=parsed["amount"],
            account=account,
            category=parsed["category"],
            description=text[:255],
            is_cleared=True,
        )

        category_label = transaction.category.name if transaction.category else "sem categoria"
        kind_label = (
            "Receita" if transaction.transaction_type == Transaction.TransactionType.INCOME else "Despesa"
        )
        send_telegram_message(
            chat_id,
            f"✅ {kind_label} de R$ {transaction.amount:.2f} ({category_label}) lançada em {account.name}.",
        )
