from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    """Web Push subscription for a single browser/device.

    A user can have multiple subscriptions (one per browser/device). The
    endpoint URL is unique per browser subscription, so it doubles as the
    natural key for upsert/removal.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="push_subscriptions",
    )
    endpoint = models.URLField("Endpoint", max_length=500, unique=True)
    p256dh = models.CharField("Chave p256dh", max_length=255)
    auth = models.CharField("Chave auth", max_length=255)
    user_agent = models.CharField("User agent", max_length=255, blank=True)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name = "Inscrição push"
        verbose_name_plural = "Inscrições push"
        indexes = [
            models.Index(fields=("tenant",), name="pushsub_tenant_idx"),
            models.Index(fields=("user",), name="pushsub_user_idx"),
        ]

    def __str__(self):
        return f"{self.user} — {self.endpoint[:60]}"
