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
            "currency",
            "initial_balance",
            "credit_limit",
            "backing_investment",
            "include_in_balance",
            "is_active",
            "balance",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "balance", "created_at", "updated_at")

    def validate_backing_investment(self, value):
        if value is None:
            return value
        tenant = self.context.get("tenant")
        if tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Investimento inválido para este tenant.")
        return value

    def validate(self, attrs):
        account_type = attrs.get("account_type", getattr(self.instance, "account_type", None))
        backing_investment = attrs.get("backing_investment", getattr(self.instance, "backing_investment", None))
        if backing_investment and account_type != Account.AccountType.CARD:
            raise serializers.ValidationError({
                "backing_investment": "Só contas do tipo Cartão podem ter um investimento de garantia."
            })
        return attrs


class CardMonthlyLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardMonthlyLimit
        fields = ("id", "account", "year", "month", "amount", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_account(self, value):
        tenant = self.context.get("tenant")
        if tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Conta invalida para este tenant.")
        return value
