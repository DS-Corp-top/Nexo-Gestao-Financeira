from calendar import monthrange
from datetime import date as date_cls, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from common.tenancy import assign_tenant


class ClosedMonth(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="closed_months",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="closed_months",
        null=True,
        blank=True,
    )
    year = models.PositiveSmallIntegerField(
        "Ano",
        validators=[MinValueValidator(2000), MaxValueValidator(9999)],
    )
    month = models.PositiveSmallIntegerField(
        "Mes",
        validators=[MinValueValidator(1), MaxValueValidator(12)],
    )
    is_closed = models.BooleanField("Fechado", default=True)
    closed_at = models.DateTimeField("Fechado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("-year", "-month")
        verbose_name = "Mes fechado"
        verbose_name_plural = "Meses fechados"
        constraints = [
            models.UniqueConstraint(
                fields=("tenant", "year", "month"),
                name="unique_closed_month_per_tenant",
            )
        ]

    def __str__(self):
        return f"{self.month:02d}/{self.year} - {self.user}"

    def save(self, *args, **kwargs):
        assign_tenant(self)
        return super().save(*args, **kwargs)


class Transaction(models.Model):
    class TransactionType(models.TextChoices):
        INCOME = "income", "Receita"
        EXPENSE = "expense", "Despesa"
        TRANSFER = "transfer", "Transferencia"

    class RecurrenceType(models.TextChoices):
        ONCE = "once", "Unica"
        FIXED = "fixed", "Fixa"
        MONTHLY = "monthly", "Mensal"
        QUARTERLY = "quarterly", "Trimestral"
        YEARLY = "yearly", "Anual"
        INSTALLMENT = "installment", "Parcelado"

    class IntervalUnit(models.TextChoices):
        DAY = "day", "Dias"
        MONTH = "month", "Mes"
        YEAR = "year", "Ano"

    RECURRING_HORIZON_MONTHS = 60
    RECURRING_HORIZON_DAYS = 1825

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="transactions",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="transactions",
        null=True,
        blank=True,
    )
    transaction_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=TransactionType.choices,
    )
    amount = models.DecimalField("Valor", max_digits=12, decimal_places=2)
    date = models.DateField("Data", default=timezone.localdate)
    account = models.ForeignKey(
        "accounts.Account",
        on_delete=models.CASCADE,
        related_name="transactions",
        verbose_name="Conta de origem",
    )
    destination_account = models.ForeignKey(
        "accounts.Account",
        on_delete=models.CASCADE,
        related_name="incoming_transfers",
        null=True,
        blank=True,
        verbose_name="Conta de destino",
    )
    category = models.ForeignKey(
        "categories.Category",
        on_delete=models.SET_NULL,
        related_name="transactions",
        null=True,
        blank=True,
        verbose_name="Categoria",
    )
    description = models.CharField("Descricao", max_length=255, blank=True)
    is_cleared = models.BooleanField(
        "Baixada",
        default=False,
        help_text="Marque quando a transacao ja foi recebida/paga.",
    )
    is_ignored = models.BooleanField(
        "Ignorada",
        default=False,
        help_text="Quando marcada, a despesa nao entra nos saldos e indicadores.",
    )

    recurrence_type = models.CharField(
        "Recorrencia",
        max_length=20,
        choices=RecurrenceType.choices,
        default=RecurrenceType.ONCE,
    )
    recurrence_interval = models.PositiveSmallIntegerField(
        "Intervalo de recorrencia",
        default=1,
        help_text="Numero do intervalo para gerar as proximas recorrencias.",
    )
    recurrence_interval_unit = models.CharField(
        "Unidade do intervalo",
        max_length=10,
        choices=IntervalUnit.choices,
        default=IntervalUnit.MONTH,
    )
    installment_count = models.PositiveSmallIntegerField(
        "Quantidade de parcelas",
        null=True,
        blank=True,
        help_text="Informe apenas quando a recorrencia for Parcelado.",
    )
    installment_number = models.PositiveSmallIntegerField(
        "Numero da parcela",
        null=True,
        blank=True,
        help_text="Indice da parcela atual dentro do plano parcelado.",
    )

    created_at = models.DateTimeField("Criada em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizada em", auto_now=True)

    class Meta:
        ordering = ("-date", "-created_at")
        verbose_name = "Transacao"
        verbose_name_plural = "Transacoes"
        indexes = [
            models.Index(fields=("tenant", "date")),
            models.Index(fields=("tenant", "transaction_type")),
            models.Index(fields=("tenant", "is_cleared", "date")),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()} - R$ {self.amount}"

    @property
    def display_title(self) -> str:
        base_title = (self.description or "").strip() or "Sem descricao"
        if (
            self.recurrence_type == self.RecurrenceType.INSTALLMENT
            and self.installment_count
        ):
            installment_number = self.installment_number or 1
            return f"{base_title} ({installment_number}/{self.installment_count})"
        return base_title

    @staticmethod
    def _add_months_safe(base_date: date_cls, month_delta: int) -> date_cls:
        serial = base_date.year * 12 + (base_date.month - 1) + month_delta
        target_year, target_month_idx = divmod(serial, 12)
        target_month = target_month_idx + 1
        target_day = min(base_date.day, monthrange(target_year, target_month)[1])
        return date_cls(target_year, target_month, target_day)

    @staticmethod
    def _add_days_safe(base_date: date_cls, day_delta: int) -> date_cls:
        return base_date + timedelta(days=day_delta)

    @staticmethod
    def _add_years_safe(base_date: date_cls, year_delta: int) -> date_cls:
        return Transaction._add_months_safe(base_date, year_delta * 12)

    def _add_interval_safe(self, base_date: date_cls, interval_value: int, interval_mode: str) -> date_cls:
        if interval_mode == "days":
            return self._add_days_safe(base_date, interval_value)
        if interval_mode == "years":
            return self._add_years_safe(base_date, interval_value)
        return self._add_months_safe(base_date, interval_value)

    def _resolve_interval_mode(self) -> str:
        if self.recurrence_interval_unit == self.IntervalUnit.DAY:
            return "days"
        if self.recurrence_interval_unit == self.IntervalUnit.YEAR:
            return "years"
        return "months"

    def _recurrence_plan(self):
        interval = max(1, self.recurrence_interval or 1)
        mode = self._resolve_interval_mode()

        if self.recurrence_type in {
            self.RecurrenceType.FIXED,
            self.RecurrenceType.MONTHLY,
        }:
            if mode == "days":
                count = self.RECURRING_HORIZON_DAYS // interval
                return mode, interval, count
            if mode == "years":
                count = self.RECURRING_HORIZON_MONTHS // (interval * 12)
                return mode, interval, count
            count = self.RECURRING_HORIZON_MONTHS // interval
            return mode, interval, count

        if self.recurrence_type == self.RecurrenceType.QUARTERLY:
            step_months = 3 * interval
            count = self.RECURRING_HORIZON_MONTHS // step_months
            return "months", step_months, count

        if self.recurrence_type == self.RecurrenceType.YEARLY:
            step_months = 12 * interval
            count = self.RECURRING_HORIZON_MONTHS // step_months
            return "months", step_months, count

        if self.recurrence_type == self.RecurrenceType.INSTALLMENT:
            total_installments = max(1, self.installment_count or 1)
            count = max(0, total_installments - 1)
            return mode, interval, count

        if self.recurrence_type == self.RecurrenceType.ONCE:
            return "months", 0, 0

        return "months", 0, 0

    def _occurrence_exists(self, target_date: date_cls) -> bool:
        return Transaction.objects.filter(
            tenant=self.tenant,
            transaction_type=self.transaction_type,
            amount=self.amount,
            date=target_date,
            account=self.account,
            destination_account=self.destination_account,
            category=self.category,
            description=self.description,
            recurrence_type=self.recurrence_type,
            recurrence_interval=self.recurrence_interval,
            recurrence_interval_unit=self.recurrence_interval_unit,
            installment_count=self.installment_count,
        ).exclude(pk=self.pk).exists()

    def generate_future_occurrences(self) -> int:
        if not self.pk:
            return 0

        interval_mode, interval_step, count = self._recurrence_plan()
        if interval_step <= 0 or count <= 0:
            return 0

        base_installment_number = self.installment_number or 1
        upcoming_rows = []
        for index in range(1, count + 1):
            target_date = self._add_interval_safe(
                self.date,
                interval_step * index,
                interval_mode,
            )
            if self._occurrence_exists(target_date):
                continue

            upcoming_rows.append(
                Transaction(
                    user=self.user,
                    tenant=self.tenant,
                    transaction_type=self.transaction_type,
                    amount=self.amount,
                    date=target_date,
                    account=self.account,
                    destination_account=self.destination_account,
                    category=self.category,
                    description=self.description,
                    is_cleared=False,
                    recurrence_type=self.recurrence_type,
                    recurrence_interval=self.recurrence_interval,
                    recurrence_interval_unit=self.recurrence_interval_unit,
                    installment_count=self.installment_count,
                    installment_number=(
                        base_installment_number + index
                        if self.recurrence_type == self.RecurrenceType.INSTALLMENT
                        else None
                    ),
                )
            )

        if not upcoming_rows:
            return 0

        Transaction.objects.bulk_create(upcoming_rows)
        return len(upcoming_rows)

    def clean(self):
        assign_tenant(self)

        if self.amount <= 0:
            raise ValidationError({"amount": "Informe um valor maior que zero."})

        if self.account and self.account.tenant_id != self.tenant_id:
            raise ValidationError({"account": "Conta invalida para este cliente."})

        if self.category and self.category.tenant_id != self.tenant_id:
            raise ValidationError({"category": "Categoria invalida para este cliente."})

        if self.destination_account and self.destination_account.tenant_id != self.tenant_id:
            raise ValidationError(
                {"destination_account": "Conta de destino invalida para este cliente."}
            )

        if not self.recurrence_interval or self.recurrence_interval < 1:
            raise ValidationError(
                {"recurrence_interval": "Informe um intervalo valido (minimo 1)."}
            )

        if self.recurrence_interval_unit not in {
            self.IntervalUnit.DAY,
            self.IntervalUnit.MONTH,
            self.IntervalUnit.YEAR,
        }:
            self.recurrence_interval_unit = self.IntervalUnit.MONTH

        if self.recurrence_type == self.RecurrenceType.ONCE:
            self.recurrence_interval = 1
            self.recurrence_interval_unit = self.IntervalUnit.MONTH

        if self.is_ignored:
            self.is_cleared = False

        if self.recurrence_type == self.RecurrenceType.INSTALLMENT:
            if not self.installment_count or self.installment_count < 2:
                raise ValidationError(
                    {
                        "installment_count": (
                            "Informe a quantidade de parcelas (minimo 2)."
                        )
                    }
                )
            if not self.installment_number or self.installment_number < 1:
                self.installment_number = 1
        else:
            self.installment_count = None
            self.installment_number = None

        if self.transaction_type == self.TransactionType.TRANSFER:
            if not self.destination_account:
                raise ValidationError(
                    {"destination_account": "Transferencias precisam de conta de destino."}
                )
            if self.destination_account == self.account:
                raise ValidationError(
                    {"destination_account": "A conta de destino deve ser diferente da origem."}
                )
            if self.category:
                raise ValidationError(
                    {"category": "Transferencia nao deve possuir categoria."}
                )
        else:
            if self.destination_account:
                raise ValidationError(
                    {
                        "destination_account": (
                            "Conta de destino e permitida apenas para transferencias."
                        )
                    }
                )
            if self.category and self.category.category_type != self.transaction_type:
                raise ValidationError(
                    {"category": "Categoria incompativel com o tipo da transacao."}
                )

    def save(self, *args, **kwargs):
        assign_tenant(self)
        self.full_clean()
        return super().save(*args, **kwargs)
