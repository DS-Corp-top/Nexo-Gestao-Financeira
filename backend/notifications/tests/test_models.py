import pytest
from django.db import IntegrityError

from notifications.models import PushSubscription


@pytest.mark.django_db
def test_push_subscription_str(baker):
    user = baker.make("auth.User", username="joana")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    subscription = baker.make(
        "notifications.PushSubscription",
        user=user,
        tenant=tenant,
        endpoint="https://fcm.googleapis.com/fcm/send/abc123",
    )

    assert str(subscription).startswith("joana")
    assert "abc123" in str(subscription)


@pytest.mark.django_db
def test_endpoint_is_unique(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    endpoint = "https://fcm.googleapis.com/fcm/send/dup"
    baker.make("notifications.PushSubscription", user=user, tenant=tenant, endpoint=endpoint)

    with pytest.raises(IntegrityError):
        PushSubscription.objects.create(
            user=user, tenant=tenant, endpoint=endpoint, p256dh="x", auth="y",
        )
