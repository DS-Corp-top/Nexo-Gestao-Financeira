import pytest
from rest_framework.test import APIClient
from django.urls import reverse


@pytest.mark.django_db
def test_list_notes_returns_only_tenant_notes(baker):
    """Listagem de notas deve retornar apenas notas do tenant do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)

    # Nota do tenant correto
    note_mine = baker.make("notes.Note", user=user, tenant=tenant, title="Minha nota")
    # Nota de outro tenant (nao deve aparecer)
    baker.make("notes.Note", user=other_user, tenant=other_tenant, title="Nota alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    titles = [n["title"] for n in response.data]
    assert "Minha nota" in titles
    assert "Nota alheia" not in titles


@pytest.mark.django_db
def test_create_note_requires_auth(baker):
    """Criacao de nota sem autenticacao deve retornar 401."""
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:note-list")
    response = client.post(url, {"title": "Tentativa", "content": "Sem auth"})
    assert response.status_code == 401


@pytest.mark.django_db
def test_create_note_with_auth(baker):
    """Criacao de nota com autenticacao e tenant deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-list")
    payload = {"title": "Nova nota", "content": "Conteudo da nota"}
    response = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 201
    assert response.data["title"] == "Nova nota"


@pytest.mark.django_db
def test_create_note_with_title_only(baker):
    """Criacao de nota apenas com titulo (sem conteudo) deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-list")
    payload = {"title": "So titulo", "content": ""}
    response = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 201
    assert response.data["title"] == "So titulo"
    assert response.data["content"] == ""


@pytest.mark.django_db
def test_update_note(baker):
    """Atualizacao de nota deve funcionar."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Original", content="Texto")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-detail", args=[note.id])
    response = client.patch(url, {"is_pinned": True}, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["is_pinned"] is True


@pytest.mark.django_db
def test_create_subtask_for_note(baker):
    """Criacao de subtarefa vinculada a uma nota deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Lista de tarefas")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-subtask-list")
    payload = {"note": note.id, "title": "Comprar leite"}
    response = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 201
    assert response.data["title"] == "Comprar leite"
    assert response.data["is_done"] is False


@pytest.mark.django_db
def test_subtask_rejects_note_from_other_tenant(baker):
    """Subtarefa nao pode ser vinculada a uma nota de outro tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_note = baker.make("notes.Note", tenant=other_tenant, title="Nota alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-subtask-list")
    payload = {"note": other_note.id, "title": "Tentativa"}
    response = client.post(url, payload, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 400


@pytest.mark.django_db
def test_toggle_subtask(baker):
    """Acao toggle deve inverter is_done da subtarefa."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant)
    subtask = baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, is_done=False)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-subtask-toggle", args=[subtask.id])
    response = client.post(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["is_done"] is True


@pytest.mark.django_db
def test_note_includes_nested_subtasks_and_counts(baker):
    """Nota retornada pela API deve incluir subtarefas e contadores."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, title="Com subtarefas")
    baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, title="Item 1", is_done=True)
    baker.make("notes.NoteSubtask", user=user, tenant=tenant, note=note, title="Item 2", is_done=False)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-detail", args=[note.id])
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert len(response.data["subtasks"]) == 2
    assert response.data["subtasks_total"] == 2
    assert response.data["subtasks_done"] == 1


@pytest.mark.django_db
def test_delete_note(baker):
    """Exclusao de nota deve retornar 204."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    note = baker.make("notes.Note", user=user, tenant=tenant, content="Para deletar")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:note-detail", args=[note.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204
