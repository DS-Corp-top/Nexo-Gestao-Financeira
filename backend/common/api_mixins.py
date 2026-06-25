"""API mixins for tenant-scoped ViewSets (DRF equivalent of UserQuerySetMixin)."""

from rest_framework.exceptions import PermissionDenied

from tenants.models import TenantMembership


def get_user_tenant(user):
    """Resolve the active tenant for a JWT-authenticated user.

    For stateless JWT requests there is no session, so we resolve the
    tenant from the user's default TenantMembership.
    """
    membership = (
        TenantMembership.objects
        .select_related("tenant")
        .filter(user=user, is_default=True, tenant__is_active=True)
        .first()
    )
    if membership:
        return membership.tenant

    # Fallback: first active membership
    membership = (
        TenantMembership.objects
        .select_related("tenant")
        .filter(user=user, tenant__is_active=True)
        .order_by("id")
        .first()
    )
    if membership:
        return membership.tenant

    raise PermissionDenied("Usuário não possui tenant ativo.")


class TenantQuerySetMixin:
    """Filter queryset by the authenticated user's tenant.

    Use this on ModelViewSets to enforce multi-tenant isolation.
    """

    tenant_field = "tenant"

    def get_tenant(self):
        # Prefer middleware-resolved tenant (session-based), fallback to JWT.
        tenant = getattr(self.request, "tenant", None)
        if tenant:
            return tenant
        return get_user_tenant(self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        return qs.filter(**{self.tenant_field: self.get_tenant()})

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user,
            tenant=self.get_tenant(),
        )

    def perform_update(self, serializer):
        serializer.save()
