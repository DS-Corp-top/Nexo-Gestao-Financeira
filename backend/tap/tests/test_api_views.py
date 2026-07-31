import pytest
from django.urls import reverse
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def _tenant_client(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    return client, user, tenant


def test_create_charter_for_own_project(baker):
    client, user, tenant = _tenant_client(baker)
    project = baker.make("todos.Project", tenant=tenant, user=user, name="Implantacao ERP")

    url = reverse("api:tap-list")
    response = client.post(
        url,
        {
            "project": project.id,
            "justification": "Reduzir retrabalho manual.",
            "objectives": "Automatizar o financeiro.",
            "sponsor_name": "Diretoria",
            "project_manager_name": "Daniel",
        },
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    assert response.data["project"] == project.id
    assert response.data["project_name"] == "Implantacao ERP"
    assert response.data["status"] == "draft"
    assert response.data["number"] == 1
    assert response.data["number_display"].startswith("0001/")


def test_create_charter_rejects_project_from_another_tenant(baker):
    """IDOR: nao deve ser possivel criar um TAP pra um projeto de outro tenant."""
    client, user, tenant = _tenant_client(baker)
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_user = baker.make("auth.User", email="other@example.com")
    other_project = baker.make("todos.Project", tenant=other_tenant, user=other_user, name="Alheio")

    url = reverse("api:tap-list")
    response = client.post(
        url,
        {"project": other_project.id, "justification": "x"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
    assert "project" in response.data


def test_number_auto_increments_per_tenant(baker):
    client, user, tenant = _tenant_client(baker)
    project = baker.make("todos.Project", tenant=tenant, user=user, name="Projeto A")

    url = reverse("api:tap-list")
    first = client.post(url, {"project": project.id}, HTTP_X_TENANT_ID=str(tenant.id))
    second = client.post(url, {"project": project.id}, HTTP_X_TENANT_ID=str(tenant.id))

    assert first.data["number"] == 1
    assert second.data["number"] == 2


def test_number_sequence_is_isolated_per_tenant(baker):
    client_a, user_a, tenant_a = _tenant_client(baker)
    project_a = baker.make("todos.Project", tenant=tenant_a, user=user_a, name="Projeto A")

    client_b, user_b, tenant_b = _tenant_client(baker)
    project_b = baker.make("todos.Project", tenant=tenant_b, user=user_b, name="Projeto B")

    url = reverse("api:tap-list")
    client_a.post(url, {"project": project_a.id}, HTTP_X_TENANT_ID=str(tenant_a.id))
    response_b = client_b.post(url, {"project": project_b.id}, HTTP_X_TENANT_ID=str(tenant_b.id))

    assert response_b.data["number"] == 1


def test_cannot_list_charters_from_another_tenant(baker):
    client, user, tenant = _tenant_client(baker)
    other_tenant = baker.make("tenants.Tenant", document="22222222222", is_active=True)
    other_user = baker.make("auth.User", email="another@example.com")
    other_project = baker.make("todos.Project", tenant=other_tenant, user=other_user, name="Alheio")
    baker.make("tap.ProjectCharter", tenant=other_tenant, project=other_project, user=other_user)

    url = reverse("api:tap-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data == []


def test_create_requires_authentication(baker):
    tenant = baker.make("tenants.Tenant", document="33333333333", is_active=True)
    user = baker.make("auth.User")
    project = baker.make("todos.Project", tenant=tenant, user=user, name="Projeto")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:tap-list")
    response = client.post(url, {"project": project.id}, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 401


def test_update_charter_to_approved(baker):
    client, user, tenant = _tenant_client(baker)
    project = baker.make("todos.Project", tenant=tenant, user=user, name="Projeto")
    charter = baker.make("tap.ProjectCharter", tenant=tenant, project=project, user=user, status="draft")

    url = reverse("api:tap-detail", args=[charter.id])
    response = client.patch(
        url,
        {"status": "approved", "approved_by_name": "Diretoria", "approved_at": "2026-07-31"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.data["status"] == "approved"
    assert response.data["status_display"] == "Aprovado"


def test_deleting_project_cascades_to_its_charters(baker):
    client, user, tenant = _tenant_client(baker)
    project = baker.make("todos.Project", tenant=tenant, user=user, name="Projeto")
    charter = baker.make("tap.ProjectCharter", tenant=tenant, project=project, user=user)

    project.delete()

    from tap.models import ProjectCharter
    assert not ProjectCharter.objects.filter(id=charter.id).exists()
