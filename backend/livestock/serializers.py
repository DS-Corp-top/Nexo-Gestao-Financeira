from rest_framework import serializers

from livestock.models import CattleLot, CattleLotEntry


class CattleLotEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CattleLotEntry
        fields = (
            "id",
            "lot",
            "entry_type",
            "date",
            "amount",
            "head_count",
            "weight_kg",
            "description",
            "created_at",
        )
        read_only_fields = ("id", "created_at")

    def get_fields(self):
        fields = super().get_fields()
        # Só aceita lotes do tenant ativo: um id de lote de outro cliente vira
        # "objeto não existe" em vez de chegar na validação do modelo.
        fields["lot"].queryset = CattleLot.objects.filter(tenant=self.context.get("tenant"))
        return fields


LOT_METRIC_FIELDS = (
    "acquisition_cost",
    "feed_cost",
    "medicine_cost",
    "vaccine_cost",
    "freight_cost",
    "other_costs",
    "total_cost",
    "sales_revenue",
    "profit",
    "margin_percent",
    "cost_per_head",
    "feed_cost_per_head_day",
    "heads_purchased",
    "heads_sold",
    "heads_on_hand",
    "avg_purchase_weight_kg",
    "avg_sale_weight_kg",
    "days_on_feed",
)

LOT_BASE_FIELDS = (
    "id",
    "name",
    "system",
    "status",
    "location",
    "start_date",
    "end_date",
    "notes",
)


def _money():
    return serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)


class CattleLotSummarySerializer(serializers.ModelSerializer):
    """Lote com indicadores calculados, sem os lançamentos (usado na listagem)."""

    acquisition_cost = _money()
    feed_cost = _money()
    medicine_cost = _money()
    vaccine_cost = _money()
    freight_cost = _money()
    other_costs = _money()
    total_cost = _money()
    sales_revenue = _money()
    profit = _money()
    margin_percent = _money()
    cost_per_head = _money()
    feed_cost_per_head_day = _money()
    heads_purchased = serializers.IntegerField(read_only=True)
    heads_sold = serializers.IntegerField(read_only=True)
    heads_on_hand = serializers.IntegerField(read_only=True)
    avg_purchase_weight_kg = _money()
    avg_sale_weight_kg = _money()
    days_on_feed = serializers.IntegerField(read_only=True)

    class Meta:
        model = CattleLot
        fields = LOT_BASE_FIELDS + LOT_METRIC_FIELDS + ("created_at", "updated_at")
        read_only_fields = ("id",) + LOT_METRIC_FIELDS + ("created_at", "updated_at")


class CattleLotSerializer(CattleLotSummarySerializer):
    entries = CattleLotEntrySerializer(many=True, read_only=True)

    class Meta(CattleLotSummarySerializer.Meta):
        fields = CattleLotSummarySerializer.Meta.fields + ("entries",)
