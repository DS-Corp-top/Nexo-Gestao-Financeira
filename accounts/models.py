from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.tenancy import assign_tenant


class Account(models.Model):
    class AccountType(models.TextChoices):
        BANK = "bank", "Banco"
        CASH = "cash", "Dinheiro"
        CARD = "card", "Cartão"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="accounts",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="accounts",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=120)
    account_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=AccountType.choices,
        default=AccountType.BANK,
    )
    initial_balance = models.DecimalField(
        "Saldo inicial",
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )
    credit_limit = models.DecimalField(
        "Limite do cartão",
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Informe o limite de crédito (apenas para contas do tipo Cartão).",
    )
    include_in_balance = models.BooleanField(
        "Considerar no saldo",
        default=True,
        help_text=(
            "Desmarque para contas que nao devem compor os saldos "
            "consolidados, como cartão de crédito."
        ),
    )
    is_active = models.BooleanField("Ativa", default=True)
    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("name",)
        verbose_name = "Conta"
        verbose_name_plural = "Contas"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "name"), name="unique_account_name_per_tenant"
            )
        ]

    def __str__(self):
        return self.name

    @property
    def balance(self) -> Decimal:
        from common.balance import calculate_account_balance

        return calculate_account_balance(self, cutoff_date=timezone.localdate())

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)
