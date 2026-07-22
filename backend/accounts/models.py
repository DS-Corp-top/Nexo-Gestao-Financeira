from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from common.tenancy import assign_tenant


class Account(models.Model):
    class AccountType(models.TextChoices):
        BANK = "bank", "Banco"
        CASH = "cash", "Dinheiro"
        CARD = "card", "Cartão"

    class Currency(models.TextChoices):
        BRL = "BRL", "Real"
        USD = "USD", "Dólar"
        EUR = "EUR", "Euro"

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
    currency = models.CharField(
        "Moeda",
        max_length=3,
        choices=Currency.choices,
        default=Currency.BRL,
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
    backing_investment = models.ForeignKey(
        "investments.Investment",
        verbose_name="Investimento de garantia",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="backed_accounts",
        help_text=(
            "Quando definido (apenas para contas do tipo Cartão), o limite "
            "disponível passa a ser o valor líquido aplicado nesse "
            "investimento, no lugar do Limite do Cartão fixo."
        ),
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


class CardMonthlyLimit(models.Model):
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="card_monthly_limits",
        null=True,
        blank=True,
    )
    account = models.ForeignKey(
        Account,
        on_delete=models.CASCADE,
        related_name="monthly_limits",
    )
    year = models.PositiveIntegerField()
    month = models.PositiveIntegerField()
    amount = models.DecimalField("Limite", max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = (("account", "year", "month"),)
        verbose_name = "Limite mensal do cartão"
        verbose_name_plural = "Limites mensais do cartão"

    def __str__(self):
        return f"{self.account.name} — {self.month:02d}/{self.year}"

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)
