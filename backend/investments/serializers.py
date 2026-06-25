from rest_framework import serializers

from investments.models import Investment, InvestmentEntry


class InvestmentEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = InvestmentEntry
        fields = (
            "id",
            "investment",
            "entry_type",
            "amount",
            "date",
            "description",
            "created_at",
        )
        read_only_fields = ("id", "created_at")


class InvestmentSerializer(serializers.ModelSerializer):
    total_invested = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    total_withdrawn = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    total_earnings = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    net_invested = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    entries = InvestmentEntrySerializer(many=True, read_only=True)

    class Meta:
        model = Investment
        fields = (
            "id",
            "name",
            "investment_type",
            "broker",
            "is_active",
            "total_invested",
            "total_withdrawn",
            "total_earnings",
            "net_invested",
            "entries",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "total_invested",
            "total_withdrawn",
            "total_earnings",
            "net_invested",
            "created_at",
            "updated_at",
        )


class InvestmentSummarySerializer(serializers.ModelSerializer):
    """List serializer without nested entries."""
    total_invested = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    total_withdrawn = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    total_earnings = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    net_invested = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = Investment
        fields = (
            "id",
            "name",
            "investment_type",
            "broker",
            "is_active",
            "total_invested",
            "total_withdrawn",
            "total_earnings",
            "net_invested",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
