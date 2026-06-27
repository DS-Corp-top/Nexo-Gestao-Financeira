from django.contrib.auth import get_user_model
from django.conf import settings
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from tenants.services import ensure_user_has_tenant


@receiver(post_save, sender=get_user_model())
def ensure_default_tenant_membership(sender, instance, created, raw, **kwargs):
    if raw or not created:
        return
    # Defer to after the current transaction commits so that any TenantMembership
    # created by RegisterSerializer.create() is visible before we run the fallback.
    user_pk = instance.pk

    def _run():
        User = get_user_model()
        try:
            user = User.objects.get(pk=user_pk)
            ensure_user_has_tenant(user)
        except User.DoesNotExist:
            pass

    if getattr(settings, "TESTING", False):
        _run()
    else:
        transaction.on_commit(_run)
