from decimal import ROUND_HALF_UP, Decimal
from functools import cached_property

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from common.tenancy import assign_tenant

ZERO = Decimal("0.00")
CENTS = Decimal("0.01")


def _quantize(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


class CattleLot(models.Model):
    """Lote de gado em confinamento ou semiconfinamento.

    Todos os indicadores (custos, receita, lucro, margem) são derivados dos
    lançamentos (CattleLotEntry) — o lote em si não guarda valores.
    """

    class System(models.TextChoices):
        FEEDLOT = "feedlot", "Confinamento"
        SEMI_FEEDLOT = "semi_feedlot", "Semiconfinamento"

    class Status(models.TextChoices):
        OPEN = "open", "Em andamento"
        CLOSED = "closed", "Encerrado"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cattle_lots",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="cattle_lots",
        null=True,
        blank=True,
    )
    name = models.CharField("Nome", max_length=120)
    system = models.CharField(
        "Sistema",
        max_length=20,
        choices=System.choices,
        default=System.FEEDLOT,
    )
    status = models.CharField(
        "Status",
        max_length=10,
        choices=Status.choices,
        default=Status.OPEN,
    )
    location = models.CharField("Local / Curral", max_length=120, blank=True)
    start_date = models.DateField("Data de entrada", default=timezone.localdate)
    end_date = models.DateField("Data de saída", null=True, blank=True)
    notes = models.TextField("Observações", blank=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)
    updated_at = models.DateTimeField("Atualizado em", auto_now=True)

    class Meta:
        ordering = ("status", "-start_date", "name")
        verbose_name = "Lote de gado"
        verbose_name_plural = "Lotes de gado"
        indexes = [models.Index(fields=("tenant", "status"))]

    def __str__(self):
        return self.name

    def clean(self):
        if self.end_date and self.start_date and self.end_date < self.start_date:
            raise ValidationError({"end_date": "A data de saída não pode ser anterior à entrada."})

    def save(self, *args, **kwargs):
        assign_tenant(self)
        self.full_clean()
        result = super().save(*args, **kwargs)
        self.__dict__.pop("_totals", None)
        return result

    @cached_property
    def _totals(self):
        # Soma em Python sobre self.entries.all() para aproveitar o
        # prefetch_related da ViewSet (evita uma query por indicador/lote).
        totals = {entry_type: ZERO for entry_type in CattleLotEntry.EntryType.values}
        heads = {"acquisition": 0, "sale": 0}
        weights = {"acquisition": [ZERO, 0], "sale": [ZERO, 0]}
        for entry in self.entries.all():
            totals[entry.entry_type] += entry.amount
            if entry.entry_type in heads and entry.head_count:
                heads[entry.entry_type] += entry.head_count
                if entry.weight_kg:
                    weights[entry.entry_type][0] += entry.weight_kg
                    weights[entry.entry_type][1] += entry.head_count
        return totals, heads, weights

    @property
    def acquisition_cost(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.ACQUISITION]

    @property
    def feed_cost(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.FEED]

    @property
    def medicine_cost(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.MEDICINE]

    @property
    def vaccine_cost(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.VACCINE]

    @property
    def freight_cost(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.FREIGHT]

    @property
    def other_costs(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.OTHER_COST]

    @property
    def total_cost(self) -> Decimal:
        return sum(
            (self._totals[0][entry_type] for entry_type in CattleLotEntry.COST_TYPES),
            ZERO,
        )

    @property
    def sales_revenue(self) -> Decimal:
        return self._totals[0][CattleLotEntry.EntryType.SALE]

    @property
    def profit(self) -> Decimal:
        return self.sales_revenue - self.total_cost

    @property
    def margin_percent(self) -> Decimal | None:
        """Margem de lucro sobre a receita de venda (lucro / receita)."""
        if not self.sales_revenue:
            return None
        return _quantize(self.profit / self.sales_revenue * 100)

    @property
    def heads_purchased(self) -> int:
        return self._totals[1]["acquisition"]

    @property
    def heads_sold(self) -> int:
        return self._totals[1]["sale"]

    @property
    def heads_on_hand(self) -> int:
        return self.heads_purchased - self.heads_sold

    @property
    def cost_per_head(self) -> Decimal | None:
        if not self.heads_purchased:
            return None
        return _quantize(self.total_cost / self.heads_purchased)

    @property
    def days_on_feed(self) -> int:
        end = self.end_date or timezone.localdate()
        return max((end - self.start_date).days, 0)

    @property
    def feed_cost_per_head_day(self) -> Decimal | None:
        """Custo médio de trato por cabeça por dia (indicador clássico de confinamento)."""
        if not self.heads_purchased or not self.days_on_feed:
            return None
        return _quantize(self.feed_cost / self.heads_purchased / self.days_on_feed)

    def _avg_weight(self, entry_type: str) -> Decimal | None:
        total_weight, heads = self._totals[2][entry_type]
        if not heads:
            return None
        return _quantize(total_weight / heads)

    @property
    def avg_purchase_weight_kg(self) -> Decimal | None:
        return self._avg_weight("acquisition")

    @property
    def avg_sale_weight_kg(self) -> Decimal | None:
        return self._avg_weight("sale")


class CattleLotEntry(models.Model):
    class EntryType(models.TextChoices):
        ACQUISITION = "acquisition", "Aquisição"
        FEED = "feed", "Trato / Alimentação"
        MEDICINE = "medicine", "Remédio"
        VACCINE = "vaccine", "Vacina"
        FREIGHT = "freight", "Frete"
        OTHER_COST = "other_cost", "Outros custos"
        SALE = "sale", "Venda"

    # Tipos em que o número de cabeças é obrigatório (entrada e saída de animais).
    HEAD_COUNT_TYPES = (EntryType.ACQUISITION, EntryType.SALE)
    # Tipos que entram no custo total do lote (tudo menos a venda).
    COST_TYPES = (
        EntryType.ACQUISITION,
        EntryType.FEED,
        EntryType.MEDICINE,
        EntryType.VACCINE,
        EntryType.FREIGHT,
        EntryType.OTHER_COST,
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="cattle_lot_entries",
    )
    tenant = models.ForeignKey(
        "tenants.Tenant",
        on_delete=models.CASCADE,
        related_name="cattle_lot_entries",
        null=True,
        blank=True,
    )
    lot = models.ForeignKey(
        CattleLot,
        on_delete=models.CASCADE,
        related_name="entries",
        verbose_name="Lote",
    )
    entry_type = models.CharField(
        "Tipo",
        max_length=20,
        choices=EntryType.choices,
        default=EntryType.FEED,
    )
    date = models.DateField("Data", default=timezone.localdate)
    amount = models.DecimalField("Valor", max_digits=14, decimal_places=2)
    head_count = models.PositiveIntegerField("Cabeças", null=True, blank=True)
    weight_kg = models.DecimalField(
        "Peso total (kg)", max_digits=12, decimal_places=2, null=True, blank=True
    )
    description = models.CharField("Descrição", max_length=255, blank=True)
    created_at = models.DateTimeField("Criado em", auto_now_add=True)

    class Meta:
        ordering = ("-date", "-created_at")
        verbose_name = "Lançamento de lote"
        verbose_name_plural = "Lançamentos de lote"
        indexes = [
            models.Index(fields=("tenant", "date")),
            models.Index(fields=("lot", "entry_type")),
        ]

    def __str__(self):
        return f"{self.lot.name} - {self.get_entry_type_display()} R$ {self.amount}"

    def clean(self):
        errors = {}
        if self.amount is not None and self.amount <= 0:
            errors["amount"] = "Informe um valor maior que zero."
        if self.weight_kg is not None and self.weight_kg <= 0:
            errors["weight_kg"] = "Informe um peso maior que zero."
        if self.lot_id and self.tenant_id and self.lot.tenant_id != self.tenant_id:
            errors["lot"] = "Lote inválido para este cliente."

        if self.entry_type in self.HEAD_COUNT_TYPES:
            if not self.head_count:
                errors["head_count"] = "Informe o número de cabeças."
        elif self.head_count or self.weight_kg:
            # Trato e outros custos não movimentam animais: evita somar cabeças
            # ou peso indevidamente nos indicadores do lote.
            self.head_count = None
            self.weight_kg = None

        if not errors and self.lot_id:
            # Vale para criar e para editar (inclusive trocar o tipo): o estoque
            # do lote, contando este lançamento como ficará, não pode ficar negativo.
            purchased, sold = self._other_heads()
            if self.entry_type == self.EntryType.ACQUISITION:
                purchased += self.head_count
            elif self.entry_type == self.EntryType.SALE:
                sold += self.head_count
            if sold > purchased:
                if self.entry_type == self.EntryType.SALE:
                    errors["head_count"] = (
                        f"Venda de {self.head_count} cabeças excede o estoque do lote "
                        f"({purchased - (sold - self.head_count)})."
                    )
                else:
                    errors["head_count"] = (
                        f"Alteração deixaria o estoque negativo: {sold} cabeças já vendidas "
                        f"para {purchased} compradas."
                    )

        if errors:
            raise ValidationError(errors)

    def _other_heads(self) -> tuple[int, int]:
        """Cabeças compradas e vendidas no lote, sem contar este lançamento."""
        others = CattleLotEntry.objects.filter(lot_id=self.lot_id).exclude(pk=self.pk)
        totals = {
            row["entry_type"]: row["total"] or 0
            for row in others.filter(entry_type__in=self.HEAD_COUNT_TYPES)
            .values("entry_type")
            .annotate(total=models.Sum("head_count"))
        }
        return totals.get(self.EntryType.ACQUISITION, 0), totals.get(self.EntryType.SALE, 0)

    def validate_delete(self):
        if self.entry_type != self.EntryType.ACQUISITION:
            return
        purchased, sold = self._other_heads()
        if sold > purchased:
            raise ValidationError(
                f"Não é possível excluir esta aquisição: {sold} cabeças já foram vendidas "
                f"e restariam {purchased} compradas. Exclua ou ajuste as vendas antes."
            )

    def save(self, *args, **kwargs):
        assign_tenant(self)
        self.full_clean()
        return super().save(*args, **kwargs)
