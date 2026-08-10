from rest_framework import serializers

from categories.models import Category


class CategorySerializer(serializers.ModelSerializer):
    def validate(self, attrs):
        tenant = self.context.get("tenant")
        name = attrs.get("name", getattr(self.instance, "name", None))
        category_type = attrs.get("category_type", getattr(self.instance, "category_type", None))

        if tenant and name and category_type:
            qs = Category.objects.filter(
                tenant=tenant,
                name=name,
                category_type=category_type,
            )
            if self.instance is not None:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    "name": "Já existe uma categoria com este nome para este tipo.",
                })

        return attrs

    class Meta:
        model = Category
        fields = ("id", "name", "category_type", "expense_kind", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
