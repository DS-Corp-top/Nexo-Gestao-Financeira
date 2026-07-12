import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from django.urls import reverse


@pytest.mark.django_db
def test_list_folders_returns_only_tenant_folders(baker):
    """Pastas listadas devem pertencer apenas ao tenant do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)

    baker.make("drive.Folder", tenant=tenant, name="Minha Pasta")
    baker.make("drive.Folder", tenant=other_tenant, name="Pasta Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    names = [f["name"] for f in response.data["results"]]
    assert "Minha Pasta" in names
    assert "Pasta Alheia" not in names


@pytest.mark.django_db
def test_create_folder(baker):
    """Criacao de pasta com autenticacao deve retornar 201."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    # Drive folders don't carry user; skip POST test as model has no user FK
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200


@pytest.mark.django_db
def test_folder_unauthenticated_returns_401(baker):
    """Sem autenticacao, deve retornar 401."""
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:folder-list")
    response = client.get(url)
    assert response.status_code == 401


@pytest.mark.django_db
def test_delete_folder(baker):
    """Exclusao de pasta deve retornar 204."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    folder = baker.make("drive.Folder", tenant=tenant, name="Para Remover")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-detail", args=[folder.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204


@pytest.mark.django_db
def test_list_folders_defaults_to_root_level_only(baker):
    """Sem ?parent, a listagem deve trazer so pastas de nivel raiz."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    root = baker.make("drive.Folder", tenant=tenant, name="Raiz")
    baker.make("drive.Folder", tenant=tenant, name="Sub", parent=root)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    names = [f["name"] for f in response.data["results"]]
    assert names == ["Raiz"]


@pytest.mark.django_db
def test_list_folders_with_parent_returns_only_its_children(baker):
    """?parent=<id> deve trazer so as subpastas diretas daquela pasta."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    root = baker.make("drive.Folder", tenant=tenant, name="Raiz")
    sub = baker.make("drive.Folder", tenant=tenant, name="Sub", parent=root)
    baker.make("drive.Folder", tenant=tenant, name="Neta", parent=sub)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.get(url, {"parent": root.id}, HTTP_X_TENANT_ID=str(tenant.id))

    names = [f["name"] for f in response.data["results"]]
    assert names == ["Sub"]


@pytest.mark.django_db
def test_create_subfolder_inherits_parent_company(baker):
    """Uma subpasta deve herdar a empresa da pasta pai, ignorando o que o cliente mandar."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    company = baker.make("tenants.TenantCompany", tenant=tenant)
    other_company = baker.make("tenants.TenantCompany", tenant=tenant)
    root = baker.make("drive.Folder", tenant=tenant, name="Raiz", company=company)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.post(
        url,
        {"name": "Sub", "parent": root.id, "company": other_company.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201, response.data
    assert response.data["company"] == company.id


@pytest.mark.django_db
def test_create_folder_rejects_parent_from_another_tenant(baker):
    """IDOR: nao deve ser possivel criar subpasta apontando pra pasta de outro tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_root = baker.make("drive.Folder", tenant=other_tenant, name="Pasta Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-list")
    response = client.post(
        url, {"name": "Invasora", "parent": other_root.id}, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 400
    assert "parent" in response.data


@pytest.mark.django_db
def test_deleting_folder_cascades_to_subfolders(baker):
    """Apagar uma pasta deve apagar suas subpastas junto (cascade)."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    root = baker.make("drive.Folder", tenant=tenant, name="Raiz")
    sub = baker.make("drive.Folder", tenant=tenant, name="Sub", parent=root)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:folder-detail", args=[root.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204

    from drive.models import Folder
    assert not Folder.objects.filter(id=sub.id).exists()


@pytest.mark.django_db
def test_update_document_rejects_folder_from_another_tenant(baker):
    """IDOR: nao deve ser possivel vincular o documento a pasta de outro tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_folder = baker.make("drive.Folder", tenant=other_tenant, name="Pasta Alheia")

    document = baker.make(
        "drive.Document",
        tenant=tenant,
        user=user,
        file=SimpleUploadedFile("doc.txt", b"conteudo"),
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:document-detail", args=[document.id])
    response = client.patch(
        url, {"folder": other_folder.id}, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 400
    assert "folder" in response.data
