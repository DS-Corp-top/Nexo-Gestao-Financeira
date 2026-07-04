import pytest
from django.urls import reverse
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db

def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant

def test_list_accounts_returns_only_tenant_accounts(baker):
    user, tenant1 = setup_tenant(baker)
    _, tenant2 = setup_tenant(baker)
    
    # Create accounts for both tenants
    account1 = baker.make("accounts.Account", tenant=tenant1, name="Tenant 1 Account")
    account2 = baker.make("accounts.Account", tenant=tenant2, name="Tenant 2 Account")
    
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    
    url = reverse("api:account-list") # Assumes a DefaultRouter or similar mapping
    # Adding X-Tenant-ID header
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant1.id))
    
    assert response.status_code == 200
    
    results = response.data.get("results", response.data) if isinstance(response.data, dict) else response.data
    names = [acc["name"] for acc in results]
    
    assert "Tenant 1 Account" in names
    assert "Tenant 2 Account" not in names

def test_cannot_access_accounts_without_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:account-list")
    response = client.get(url)
    assert response.status_code == 401


def test_update_card_monthly_limit_rejects_account_from_another_tenant(baker):
    """IDOR: PATCH nao deve aceitar uma conta de outro tenant."""
    user, tenant1 = setup_tenant(baker)
    _, tenant2 = setup_tenant(baker)

    account1 = baker.make("accounts.Account", tenant=tenant1, name="Conta Tenant 1")
    account2 = baker.make("accounts.Account", tenant=tenant2, name="Conta Tenant 2")
    limit = baker.make(
        "accounts.CardMonthlyLimit", tenant=tenant1, account=account1, year=2026, month=6
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-detail", args=[limit.id])
    response = client.patch(
        url, {"account": account2.id}, HTTP_X_TENANT_ID=str(tenant1.id)
    )

    assert response.status_code == 400
    assert "account" in response.data


def test_create_card_monthly_limit_requires_all_fields(baker):
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-list")
    response = client.post(
        url, {"account": account.id, "year": 2026}, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 400


def test_create_card_monthly_limit_rejects_unknown_account(baker):
    user, tenant = setup_tenant(baker)
    _, other_tenant = setup_tenant(baker)
    other_account = baker.make("accounts.Account", tenant=other_tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-list")
    response = client.post(
        url,
        {"account": other_account.id, "year": 2026, "month": 6, "amount": "100.00"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 404


def test_create_card_monthly_limit_rejects_invalid_month(baker):
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-list")
    response = client.post(
        url,
        {"account": account.id, "year": 2026, "month": 13, "amount": "100.00"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


def test_create_card_monthly_limit_rejects_negative_amount(baker):
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-list")
    response = client.post(
        url,
        {"account": account.id, "year": 2026, "month": 6, "amount": "-1.00"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


def test_create_card_monthly_limit_is_upsert(baker):
    """POST repetido para o mesmo account/year/month atualiza em vez de duplicar."""
    user, tenant = setup_tenant(baker)
    account = baker.make("accounts.Account", tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:cardmonthlylimit-list")
    payload = {"account": account.id, "year": 2026, "month": 6, "amount": "100.00"}

    first = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))
    assert first.status_code == 201

    payload["amount"] = "200.00"
    second = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))
    assert second.status_code == 200
    assert second.data["id"] == first.data["id"]

    from accounts.models import CardMonthlyLimit
    assert CardMonthlyLimit.objects.filter(account=account, year=2026, month=6).count() == 1
