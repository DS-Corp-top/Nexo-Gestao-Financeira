from rest_framework import serializers

from accounts.models import Account, CardMonthlyLimit


class AccountSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = Account
        fields = (
            "id",
            "name",
            "account_type",
            "initial_balance",
            "credit_limit",
            "include_in_balance",
            "is_active",
            "balance",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "balance", "created_at", "updated_at")


class CardMonthlyLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardMonthlyLimit
        fields = ("id", "account", "year", "month", "amount", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
