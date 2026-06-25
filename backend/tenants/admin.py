from django.contrib import admin

from tenants.models import Tenant, TenantMembership


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "owner", "is_active", "created_at")
    list_filter = ("is_active",)
    search_fields = ("name", "slug", "owner__username")


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ("tenant", "user", "role", "is_default", "created_at")
    list_filter = ("role", "is_default")
    search_fields = ("tenant__name", "user__username")
