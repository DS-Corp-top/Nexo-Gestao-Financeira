from tenants.services import ensure_user_has_tenant


def resolve_tenant(*, tenant=None, user=None):
    if tenant is not None:
        return tenant
    if user is None:
        return None
    return ensure_user_has_tenant(user)


def assign_tenant(instance):
    current_tenant = getattr(instance, "tenant", None)
    if current_tenant is not None or getattr(instance, "tenant_id", None):
        return current_tenant

    user = getattr(instance, "user", None)
    if user is None and getattr(instance, "user_id", None):
        user = instance.user

    tenant = resolve_tenant(user=user)
    if tenant is not None:
        instance.tenant = tenant
    return tenant
