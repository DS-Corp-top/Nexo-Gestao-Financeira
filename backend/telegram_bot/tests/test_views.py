from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.urls import reverse
from rest_framework.test import APIClient

from telegram_bot.models import TelegramLink
from transactions.models import Transaction

pytestmark = pytest.mark.django_db


def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


@pytest.fixture(autouse=True)
def _no_real_telegram_calls():
    with patch("telegram_bot.api_views.send_telegram_message") as mocked:
        yield mocked


def test_link_status_when_not_linked(baker):
    user, _ = setup_tenant(baker)
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.get(reverse("api:telegram_link_status"))

    assert response.status_code == 200
    assert response.data == {"linked": False}


def test_generate_link_code_rejects_account_from_other_tenant(baker):
    user, tenant = setup_tenant(baker)
    _, other_tenant = setup_tenant(baker)
    other_account = baker.make("accounts.Account", tenant=other_tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(
        reverse("api:telegram_link_code"),
        {"account_id": other_account.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


def test_generate_link_code_returns_deep_link(baker, settings):
    settings.TELEGRAM_BOT_USERNAME = "NexoTestBot"
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant, account_type="bank")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(
        reverse("api:telegram_link_code"),
        {"account_id": account.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.data["deep_link"] == f"https://t.me/NexoTestBot?start={response.data['code']}"


def test_webhook_rejects_wrong_secret(settings):
    settings.TELEGRAM_WEBHOOK_SECRET = "expected-secret"
    client = APIClient()

    response = client.post(
        reverse("api:telegram_webhook"),
        {"message": {"chat": {"id": 1}, "text": "oi"}},
        format="json",
        HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN="wrong-secret",
    )

    assert response.status_code == 403


def test_webhook_start_links_account_using_cached_code(baker):
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant, account_type="bank")
    cache.set(
        "telegram_link_code:ABC123",
        {"user_id": user.id, "tenant_id": tenant.id, "account_id": account.id},
        timeout=60,
    )

    client = APIClient()
    response = client.post(
        reverse("api:telegram_webhook"),
        {"message": {"chat": {"id": 555}, "text": "/start ABC123"}},
        format="json",
    )

    assert response.status_code == 200
    link = TelegramLink.objects.get(user=user)
    assert link.chat_id == 555
    assert link.default_account_id == account.id
    assert cache.get("telegram_link_code:ABC123") is None


def test_webhook_message_creates_transaction_for_linked_chat(baker):
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant, account_type="bank")
    baker.make(
        "telegram_bot.TelegramLink",
        user=user,
        tenant=tenant,
        chat_id=777,
        default_account=account,
    )

    client = APIClient()
    response = client.post(
        reverse("api:telegram_webhook"),
        {"message": {"chat": {"id": 777}, "text": "Mercado 89,90"}},
        format="json",
    )

    assert response.status_code == 200
    transaction = Transaction.objects.get(tenant=tenant)
    assert transaction.amount == "89.90" or float(transaction.amount) == 89.90
    assert transaction.transaction_type == "expense"
    assert transaction.account_id == account.id
    assert transaction.user_id == user.id


def test_webhook_message_from_unlinked_chat_does_not_create_transaction():
    client = APIClient()
    response = client.post(
        reverse("api:telegram_webhook"),
        {"message": {"chat": {"id": 999}, "text": "Mercado 89,90"}},
        format="json",
    )

    assert response.status_code == 200
    assert Transaction.objects.count() == 0
