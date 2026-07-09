import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from notifications.models import PushSubscription


@pytest.mark.django_db
def test_vapid_public_key_requires_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    response = client.get(reverse("api:push_vapid_public_key"))
    assert response.status_code == 401


@pytest.mark.django_db
@override_settings(VAPID_PUBLIC_KEY="test-public-key")
def test_vapid_public_key_returns_configured_key(baker):
    user = baker.make("auth.User")
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.get(reverse("api:push_vapid_public_key"))

    assert response.status_code == 200
    assert response.data["public_key"] == "test-public-key"


@pytest.mark.django_db
def test_subscribe_requires_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    response = client.post(reverse("api:push_subscribe"), {"endpoint": "https://x/1", "keys": {"p256dh": "a", "auth": "b"}}, format="json")
    assert response.status_code == 401


@pytest.mark.django_db
def test_subscribe_creates_subscription(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    payload = {"endpoint": "https://fcm.googleapis.com/fcm/send/xyz", "keys": {"p256dh": "pkey", "auth": "akey"}}
    response = client.post(reverse("api:push_subscribe"), payload, format="json", HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    subscription = PushSubscription.objects.get(endpoint=payload["endpoint"])
    assert subscription.user_id == user.id
    assert subscription.tenant_id == tenant.id
    assert subscription.p256dh == "pkey"
    assert subscription.auth == "akey"


@pytest.mark.django_db
def test_subscribe_upserts_by_endpoint(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    endpoint = "https://fcm.googleapis.com/fcm/send/same"

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    first = {"endpoint": endpoint, "keys": {"p256dh": "old", "auth": "old"}}
    second = {"endpoint": endpoint, "keys": {"p256dh": "new", "auth": "new"}}
    client.post(reverse("api:push_subscribe"), first, format="json", HTTP_X_TENANT_ID=str(tenant.id))
    client.post(reverse("api:push_subscribe"), second, format="json", HTTP_X_TENANT_ID=str(tenant.id))

    assert PushSubscription.objects.filter(endpoint=endpoint).count() == 1
    assert PushSubscription.objects.get(endpoint=endpoint).p256dh == "new"


@pytest.mark.django_db
def test_subscribe_missing_fields_returns_400(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(reverse("api:push_subscribe"), {"endpoint": ""}, format="json", HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 400


@pytest.mark.django_db
def test_unsubscribe_deletes_own_subscription(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    subscription = baker.make("notifications.PushSubscription", user=user, tenant=tenant, endpoint="https://x/mine")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(reverse("api:push_unsubscribe"), {"endpoint": subscription.endpoint}, format="json")

    assert response.status_code == 204
    assert not PushSubscription.objects.filter(pk=subscription.pk).exists()


@pytest.mark.django_db
def test_unsubscribe_does_not_delete_other_users_subscription(baker):
    owner = baker.make("auth.User")
    attacker = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    subscription = baker.make("notifications.PushSubscription", user=owner, tenant=tenant, endpoint="https://x/owner")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=attacker)

    response = client.post(reverse("api:push_unsubscribe"), {"endpoint": subscription.endpoint}, format="json")

    assert response.status_code == 204
    assert PushSubscription.objects.filter(pk=subscription.pk).exists()


@pytest.mark.django_db
def test_unsubscribe_missing_endpoint_returns_400(baker):
    user = baker.make("auth.User")
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(reverse("api:push_unsubscribe"), {}, format="json")
    assert response.status_code == 400
