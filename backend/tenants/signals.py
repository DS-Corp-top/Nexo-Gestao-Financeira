from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver

from tenants.services import ensure_user_has_tenant


@receiver(post_save, sender=get_user_model())
def ensure_default_tenant_membership(sender, instance, created, raw, **kwargs):
    if raw or not created:
        return
    ensure_user_has_tenant(instance)
