import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
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


def test_upload_attachment_to_own_todo(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")

    url = reverse("api:todo-attachment-list")
    response = client.post(
        url,
        {"todo": todo.id, "file": SimpleUploadedFile("relatorio.pdf", b"conteudo do arquivo")},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    assert response.data["file_name"] == "relatorio.pdf"
    assert response.data["file_type"] == "pdf"
    assert response.data["file_size"] == len(b"conteudo do arquivo")
    assert response.data["file_url"]


def test_upload_rejects_blocked_extension(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")

    url = reverse("api:todo-attachment-list")
    response = client.post(
        url,
        {"todo": todo.id, "file": SimpleUploadedFile("script.exe", b"MZ")},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
    assert "file" in response.data


def test_upload_rejects_todo_from_another_tenant(baker):
    """IDOR: nao deve ser possivel anexar arquivo numa tarefa de outro tenant."""
    client, user, tenant = _tenant_client(baker)
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_user = baker.make("auth.User", email="other@example.com")
    other_todo = baker.make("todos.TodoItem", tenant=other_tenant, user=other_user, title="Alheia")

    url = reverse("api:todo-attachment-list")
    response = client.post(
        url,
        {"todo": other_todo.id, "file": SimpleUploadedFile("a.txt", b"x")},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400
    assert "todo" in response.data


def test_todo_detail_embeds_attachments_and_count(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")
    baker.make(
        "todos.TodoAttachment", tenant=tenant, todo=todo, user=user,
        file=SimpleUploadedFile("a.txt", b"x"),
    )
    baker.make(
        "todos.TodoAttachment", tenant=tenant, todo=todo, user=user,
        file=SimpleUploadedFile("b.txt", b"y"),
    )

    url = reverse("api:todo-detail", args=[todo.id])
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["attachment_count"] == 2
    assert len(response.data["attachments"]) == 2


def test_list_attachments_filtered_by_todo(baker):
    client, user, tenant = _tenant_client(baker)
    todo_a = baker.make("todos.TodoItem", tenant=tenant, user=user, title="A")
    todo_b = baker.make("todos.TodoItem", tenant=tenant, user=user, title="B")
    baker.make("todos.TodoAttachment", tenant=tenant, todo=todo_a, user=user, file=SimpleUploadedFile("a.txt", b"x"))
    baker.make("todos.TodoAttachment", tenant=tenant, todo=todo_b, user=user, file=SimpleUploadedFile("b.txt", b"y"))

    url = reverse("api:todo-attachment-list")
    response = client.get(url, {"todo": todo_a.id}, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert len(response.data) == 1
    assert response.data[0]["file_name"] == "a.txt"


def test_cannot_list_attachments_from_another_tenant(baker):
    client, user, tenant = _tenant_client(baker)
    other_tenant = baker.make("tenants.Tenant", document="22222222222", is_active=True)
    other_user = baker.make("auth.User", email="another@example.com")
    other_todo = baker.make("todos.TodoItem", tenant=other_tenant, user=other_user, title="Alheia")
    baker.make(
        "todos.TodoAttachment", tenant=other_tenant, todo=other_todo, user=other_user,
        file=SimpleUploadedFile("secreto.txt", b"x"),
    )

    url = reverse("api:todo-attachment-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data == []


def test_delete_own_attachment(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")
    attachment = baker.make(
        "todos.TodoAttachment", tenant=tenant, todo=todo, user=user,
        file=SimpleUploadedFile("a.txt", b"x"),
    )

    url = reverse("api:todo-attachment-detail", args=[attachment.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204

    from todos.models import TodoAttachment
    assert not TodoAttachment.objects.filter(id=attachment.id).exists()


def test_cannot_delete_attachment_from_another_tenant(baker):
    client, user, tenant = _tenant_client(baker)
    other_tenant = baker.make("tenants.Tenant", document="33333333333", is_active=True)
    other_user = baker.make("auth.User", email="third@example.com")
    other_todo = baker.make("todos.TodoItem", tenant=other_tenant, user=other_user, title="Alheia")
    attachment = baker.make(
        "todos.TodoAttachment", tenant=other_tenant, todo=other_todo, user=other_user,
        file=SimpleUploadedFile("secreto.txt", b"x"),
    )

    url = reverse("api:todo-attachment-detail", args=[attachment.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 404

    from todos.models import TodoAttachment
    assert TodoAttachment.objects.filter(id=attachment.id).exists()


def test_upload_requires_authentication(baker):
    tenant = baker.make("tenants.Tenant", document="44444444444", is_active=True)
    user = baker.make("auth.User")
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:todo-attachment-list")
    response = client.post(
        url,
        {"todo": todo.id, "file": SimpleUploadedFile("a.txt", b"x")},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 401


def test_upload_without_file_is_rejected(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")

    url = reverse("api:todo-attachment-list")
    response = client.post(url, {"todo": todo.id}, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 400
    assert "file" in response.data


def test_retrieve_single_attachment(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")
    attachment = baker.make(
        "todos.TodoAttachment", tenant=tenant, todo=todo, user=user,
        file=SimpleUploadedFile("contrato.pdf", b"conteudo"),
    )

    url = reverse("api:todo-attachment-detail", args=[attachment.id])
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["file_name"] == "contrato.pdf"


def test_deleting_todo_cascades_to_its_attachments(baker):
    client, user, tenant = _tenant_client(baker)
    todo = baker.make("todos.TodoItem", tenant=tenant, user=user, title="Tarefa")
    attachment = baker.make(
        "todos.TodoAttachment", tenant=tenant, todo=todo, user=user,
        file=SimpleUploadedFile("a.txt", b"x"),
    )

    url = reverse("api:todo-detail", args=[todo.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 204

    from todos.models import TodoAttachment
    assert not TodoAttachment.objects.filter(id=attachment.id).exists()
