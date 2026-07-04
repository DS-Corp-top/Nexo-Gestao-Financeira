from rest_framework import serializers

from shopping.models import ShoppingItem, ShoppingList


class ShoppingItemSerializer(serializers.ModelSerializer):
    estimated_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = ShoppingItem
        fields = (
            "id",
            "shopping_list",
            "title",
            "quantity",
            "unit_price",
            "notes",
            "is_purchased",
            "purchased_at",
            "estimated_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "purchased_at", "estimated_total", "created_at", "updated_at")

    def validate_shopping_list(self, value):
        tenant = self.context.get("tenant")
        if tenant and value.tenant_id != tenant.pk:
            raise serializers.ValidationError("Lista de compras invalida para este tenant.")
        return value


class ShoppingListSerializer(serializers.ModelSerializer):
    pending_count = serializers.IntegerField(read_only=True)
    purchased_count = serializers.IntegerField(read_only=True)
    purchased_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )
    items = ShoppingItemSerializer(many=True, read_only=True)

    class Meta:
        model = ShoppingList
        fields = (
            "id",
            "name",
            "list_date",
            "notes",
            "pending_count",
            "purchased_count",
            "purchased_total",
            "items",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "pending_count",
            "purchased_count",
            "purchased_total",
            "created_at",
            "updated_at",
        )


class ShoppingListSummarySerializer(serializers.ModelSerializer):
    """List serializer without nested items (for performance on list view)."""
    pending_count = serializers.IntegerField(read_only=True)
    purchased_count = serializers.IntegerField(read_only=True)
    purchased_total = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = ShoppingList
        fields = (
            "id",
            "name",
            "list_date",
            "notes",
            "pending_count",
            "purchased_count",
            "purchased_total",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
