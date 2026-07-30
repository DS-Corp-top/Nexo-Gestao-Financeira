import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def send_password_reset_email(user, code: str, ttl_minutes: int) -> None:
    subject = "Código de recuperação de senha — Nexo Financeiro"
    greeting_name = user.first_name or user.username
    message = (
        f"Olá, {greeting_name}!\n\n"
        f"Use o código abaixo para redefinir sua senha no Nexo Financeiro:\n\n"
        f"    {code}\n\n"
        f"Esse código expira em {ttl_minutes} minutos.\n\n"
        f"Se você não solicitou a recuperação de senha, pode ignorar este e-mail com segurança."
    )
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)
    except Exception:
        logger.exception("Falha ao enviar e-mail de recuperação de senha para user_id=%s", user.pk)
