import json

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from common.api_mixins import is_view_only_superuser


def body_of(response):
    """Parse the actual rendered response bytes (not response.data — that's the
    live in-memory dict, and mutating it after render() is a silent no-op that
    never reaches the client; this is what a real browser would receive)."""
    return json.loads(response.content)

pytestmark = pytest.mark.django_db


def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


def test_is_view_only_superuser_true_without_membership(baker):
    superuser = baker.make("auth.User", is_superuser=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    assert is_view_only_superuser(superuser, tenant) is True


def test_is_view_only_superuser_false_with_membership(baker):
    superuser, tenant = setup_tenant(baker)
    superuser.is_superuser = True
    superuser.save()
    assert is_view_only_superuser(superuser, tenant) is False


def test_is_view_only_superuser_false_for_regular_user(baker):
    user, tenant = setup_tenant(baker)
    other_tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    assert is_view_only_superuser(user, other_tenant) is False


def test_superuser_browsing_foreign_tenant_sees_no_content(baker):
    """End-to-end: superuser opens a tenant they don't belong to via X-Tenant-ID.
    List results must be completely empty (not just masked fields) — only the
    count is allowed to leak, so navigation/pagination keep working."""
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)
    baker.make(
        "accounts.Account", tenant=tenant, name="Conta Alheia",
        initial_balance="500.00", credit_limit=None,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:account-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    assert body["count"] == 1
    assert body["results"] == []


def test_superuser_browsing_foreign_tenant_cannot_retrieve_detail(baker):
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)
    account = baker.make("accounts.Account", tenant=tenant, name="Conta Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:account-detail", args=[account.pk])
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 403


def test_owner_viewing_own_tenant_sees_real_amounts(baker):
    """Control: a normal member of the tenant must still see real values."""
    user, tenant = setup_tenant(baker)
    baker.make(
        "accounts.Account", tenant=tenant, name="Minha Conta",
        initial_balance="500.00", credit_limit=None,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    url = reverse("api:account-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    results = body.get("results", body) if isinstance(body, dict) else body
    account_data = next(a for a in results if a["name"] == "Minha Conta")

    assert account_data["initial_balance"] == "500.00"
    assert account_data["balance"] == "500.00"


def test_dashboard_masked_flag_and_amounts_for_foreign_tenant(baker):
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:dashboard")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    body = body_of(response)
    assert body["masked"] is True
    assert body["kpis"]["user_balance"] is None
    assert body["alerts"]["consolidated_balance"] is None
    assert body["accounts"] == []
    assert body["due_notifications"]["items"] == []
    assert body["expense_by_category"] == []


def test_superuser_browsing_foreign_tenant_cannot_see_project_content(baker):
    """Reproduces the reported leak: project name/description showing up
    in the Todos page while impersonating a foreign tenant."""
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)
    baker.make(
        "todos.Project", tenant=tenant, name="Elges",
        description="Objetivo construir um sistema para atender o departamento juridico.",
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:todo-project-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert body_of(response) == []


def test_superuser_cannot_use_custom_actions_on_foreign_tenant_objects(baker):
    """Custom @actions (toggle, pay, add_entry, ...) call self.get_object()
    directly, bypassing retrieve() — get_object() itself must block them too."""
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)
    project = baker.make("todos.Project", tenant=tenant)
    todo = baker.make("todos.TodoItem", tenant=tenant, project=project)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:todo-toggle", args=[todo.pk])
    response = client.post(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 403


def test_superuser_browsing_foreign_tenant_sees_no_member_names(baker):
    user, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    url = reverse("api:tenant_members")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert body_of(response) == []
