import pytest
from rest_framework.test import APIClient
from django.urls import reverse


@pytest.mark.django_db
def test_create_todo_rejects_assigned_to_from_another_tenant(baker):
    """Disclosure: nao deve ser possivel atribuir a tarefa a um usuario de outro tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    outsider = baker.make("auth.User", email="outsider@example.com")
    baker.make("tenants.Tenant", document="11111111111", is_active=True)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-list")
    response = client.post(
        url,
        {"title": "Tarefa", "assigned_to": outsider.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
    assert "assigned_to" in response.data


@pytest.mark.django_db
def test_create_todo_rejects_project_from_another_tenant(baker):
    """IDOR: nao deve ser possivel anexar a tarefa a um projeto de outro tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_project = baker.make("todos.Project", tenant=other_tenant, name="Projeto Alheio")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-list")
    response = client.post(
        url,
        {"title": "Tarefa", "project": other_project.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
    assert "project" in response.data
