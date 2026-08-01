import pytest
from rest_framework.test import APIClient
from django.urls import reverse
from django.utils import timezone


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


@pytest.mark.django_db
def test_reorder_sets_order_and_status_for_target_column(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    a = baker.make("todos.TodoItem", tenant=tenant, user=user, status="pending", order=0)
    b = baker.make("todos.TodoItem", tenant=tenant, user=user, status="pending", order=1)
    c = baker.make("todos.TodoItem", tenant=tenant, user=user, status="in_progress", order=0)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": [c.id, b.id, a.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    c.refresh_from_db()
    b.refresh_from_db()
    a.refresh_from_db()
    assert (c.status, c.order) == ("pending", 0)
    assert (b.status, b.order) == ("pending", 1)
    assert (a.status, a.order) == ("pending", 2)


@pytest.mark.django_db
def test_reorder_rejects_ids_from_another_tenant(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_item = baker.make("todos.TodoItem", tenant=other_tenant, status="pending", order=0)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": [other_item.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reorder_rejects_invalid_status(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    item = baker.make("todos.TodoItem", tenant=tenant, user=user, status="pending", order=0)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "bogus", "ordered_ids": [item.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reorder_into_done_marks_item_done(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    item = baker.make(
        "todos.TodoItem", tenant=tenant, user=user, status="pending",
        is_done=False, done_at=None, order=0,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "done", "ordered_ids": [item.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    item.refresh_from_db()
    assert item.status == "done"
    assert item.is_done is True
    assert item.done_at is not None


@pytest.mark.django_db
def test_reorder_out_of_done_clears_done_at(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    item = baker.make(
        "todos.TodoItem", tenant=tenant, user=user, status="done",
        is_done=True, done_at=timezone.now(), order=0,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": [item.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    item.refresh_from_db()
    assert item.status == "pending"
    assert item.is_done is False
    assert item.done_at is None


@pytest.mark.django_db
def test_reorder_rejects_empty_ordered_ids(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": []},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reorder_rejects_non_list_ordered_ids(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    item = baker.make("todos.TodoItem", tenant=tenant, user=user, status="pending", order=0)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": item.id},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_reorder_rejects_duplicate_ids(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    item = baker.make("todos.TodoItem", tenant=tenant, user=user, status="pending", order=0)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:todo-reorder")
    response = client.post(
        url,
        {"status": "pending", "ordered_ids": [item.id, item.id]},
        format="json",
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
