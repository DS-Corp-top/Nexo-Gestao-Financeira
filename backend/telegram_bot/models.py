from django.conf import settings
from django.db import models

from common.tenancy import assign_tenant


class TelegramLink(models.Model):
    """Links a Nexo user to a Telegram chat so messages sent to the bot
    can be turned into transactions on that user's default account."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="telegram_link",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="telegram_links",
    )
    chat_id = models.BigIntegerField("Chat ID", unique=True)
    default_account = models.ForeignKey(
        "accounts.Account",
        on_delete=models.SET_NULL,
        related_name="telegram_links",
        null=True,
        blank=True,
        help_text="Conta usada para lançamentos criados via Telegram.",
    )
    linked_at = models.DateTimeField("Vinculado em", auto_now_add=True)

    class Meta:
        verbose_name = "Vínculo do Telegram"
        verbose_name_plural = "Vínculos do Telegram"

    def __str__(self):
        return f"{self.user} — chat {self.chat_id}"

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)
