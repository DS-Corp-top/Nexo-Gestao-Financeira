from rest_framework import serializers

from tenants.models import Tenant, TenantMembership, NfseCredential


class TenantSerializer(serializers.ModelSerializer):
    formatted_address_line = serializers.CharField(read_only=True)
    formatted_city_state = serializers.CharField(read_only=True)
    full_address = serializers.CharField(read_only=True)

    class Meta:
        model = Tenant
        fields = (
            "id",
            "name",
            "slug",
            "document",
            "email",
            "phone",
            "address",
            "address_number",
            "address_complement",
            "district",
            "city",
            "state",
            "postal_code",
            "logo",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_active",
            "default_interface",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "slug",
            "formatted_address_line",
            "formatted_city_state",
            "full_address",
            "is_active",
            "created_at",
            "updated_at",
        )


class TenantMembershipSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source="tenant.name", read_only=True)

    class Meta:
        model = TenantMembership
        fields = ("id", "tenant", "tenant_name", "role", "is_default", "created_at", "updated_at")
        read_only_fields = ("id", "tenant", "role", "created_at", "updated_at")

class NfseCredentialSerializer(serializers.ModelSerializer):
    class Meta:
        model = NfseCredential
        fields = "__all__"
        read_only_fields = ("id", "tenant", "created_at", "updated_at")
