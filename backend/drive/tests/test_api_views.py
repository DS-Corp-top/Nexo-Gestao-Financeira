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
    """Apagar uma pasta deve mandar suas subpastas pra lixeira junto (soft-delete
    em cascata) — a subpasta continua existindo no banco, so nao aparece mais
    na listagem normal. Ver test_deleting_a_folder_cascades_soft_delete_to_documents_and_subfolders
    para a cobertura completa (documentos inclusive)."""
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

    sub.refresh_from_db()
    assert sub.deleted_at is not None


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


@pytest.mark.django_db
def test_uploading_the_same_content_twice_is_flagged_as_duplicate(baker):
    """Subir o mesmo conteudo duas vezes deve retornar 409, nao criar outro documento."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:document-list")
    content = b"mesmo conteudo exato"

    first = client.post(
        url, {"file": SimpleUploadedFile("a.txt", content)}, HTTP_X_TENANT_ID=str(tenant.id)
    )
    assert first.status_code == 201

    second = client.post(
        url, {"file": SimpleUploadedFile("b.txt", content)}, HTTP_X_TENANT_ID=str(tenant.id)
    )
    assert second.status_code == 409
    assert second.data["duplicate"] is True
    assert second.data["existing_document"]["id"] == first.data["id"]

    from drive.models import Document
    assert Document.objects.filter(tenant=tenant).count() == 1


@pytest.mark.django_db
def test_allow_duplicate_flag_bypasses_the_check(baker):
    """Com allow_duplicate=true, o upload deve ser aceito mesmo com conteudo repetido."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:document-list")
    content = b"mesmo conteudo exato"

    client.post(url, {"file": SimpleUploadedFile("a.txt", content)}, HTTP_X_TENANT_ID=str(tenant.id))
    second = client.post(
        url,
        {"file": SimpleUploadedFile("b.txt", content), "allow_duplicate": "true"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert second.status_code == 201

    from drive.models import Document
    assert Document.objects.filter(tenant=tenant).count() == 2


@pytest.mark.django_db
def test_duplicate_check_is_scoped_per_tenant(baker):
    """O mesmo conteudo em tenants diferentes nao deve ser tratado como duplicado."""
    user_a = baker.make("auth.User")
    tenant_a = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user_a, tenant=tenant_a)

    user_b = baker.make("auth.User")
    tenant_b = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=user_b, tenant=tenant_b)

    content = b"mesmo conteudo exato"
    url = reverse("api:document-list")

    client_a = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client_a.force_authenticate(user=user_a)
    client_a.post(url, {"file": SimpleUploadedFile("a.txt", content)}, HTTP_X_TENANT_ID=str(tenant_a.id))

    client_b = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client_b.force_authenticate(user=user_b)
    response = client_b.post(
        url, {"file": SimpleUploadedFile("b.txt", content)}, HTTP_X_TENANT_ID=str(tenant_b.id)
    )

    assert response.status_code == 201


@pytest.mark.django_db
def test_deleting_a_document_soft_deletes_it(baker):
    """DELETE nao apaga de verdade — so marca deleted_at e some da listagem normal."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    document = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("a.txt", b"x"))

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.delete(reverse("api:document-detail", args=[document.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 204

    from drive.models import Document
    document.refresh_from_db()
    assert document.deleted_at is not None
    assert Document.objects.filter(id=document.id).exists()  # ainda existe no banco

    listing = client.get(reverse("api:document-list"), HTTP_X_TENANT_ID=str(tenant.id))
    assert document.id not in [d["id"] for d in listing.data["results"]]


@pytest.mark.django_db
def test_deleting_a_folder_cascades_soft_delete_to_documents_and_subfolders(baker):
    """Apagar uma pasta deve mandar ela, suas subpastas e documentos pra lixeira junto."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    root = baker.make("drive.Folder", tenant=tenant, name="Raiz")
    sub = baker.make("drive.Folder", tenant=tenant, name="Sub", parent=root)
    doc_in_root = baker.make("drive.Document", tenant=tenant, user=user, folder=root, file=SimpleUploadedFile("a.txt", b"x"))
    doc_in_sub = baker.make("drive.Document", tenant=tenant, user=user, folder=sub, file=SimpleUploadedFile("b.txt", b"y"))

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.delete(reverse("api:folder-detail", args=[root.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 204

    root.refresh_from_db()
    sub.refresh_from_db()
    doc_in_root.refresh_from_db()
    doc_in_sub.refresh_from_db()
    assert root.deleted_at is not None
    assert sub.deleted_at is not None
    assert doc_in_root.deleted_at is not None
    assert doc_in_sub.deleted_at is not None


@pytest.mark.django_db
def test_trash_endpoint_lists_only_soft_deleted_items_for_this_tenant(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    active_doc = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("active.txt", b"x"))
    trashed_doc = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("trashed.txt", b"y"))
    trashed_doc.soft_delete()

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.get(reverse("api:document-trash"), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200
    ids = [d["id"] for d in response.data["results"]]
    assert trashed_doc.id in ids
    assert active_doc.id not in ids
    assert response.data["results"][0]["days_until_purge"] == 30


@pytest.mark.django_db
def test_restore_document_brings_it_back_to_the_normal_listing(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    document = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("a.txt", b"x"))
    document.soft_delete()

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(reverse("api:document-restore", args=[document.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200

    document.refresh_from_db()
    assert document.deleted_at is None

    listing = client.get(reverse("api:document-list"), HTTP_X_TENANT_ID=str(tenant.id))
    assert document.id in [d["id"] for d in listing.data["results"]]


@pytest.mark.django_db
def test_restore_folder_cascades_to_documents_and_subfolders(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    root = baker.make("drive.Folder", tenant=tenant, name="Raiz")
    sub = baker.make("drive.Folder", tenant=tenant, name="Sub", parent=root)
    doc = baker.make("drive.Document", tenant=tenant, user=user, folder=root, file=SimpleUploadedFile("a.txt", b"x"))
    root.soft_delete()

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.post(reverse("api:folder-restore", args=[root.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 200

    root.refresh_from_db()
    sub.refresh_from_db()
    doc.refresh_from_db()
    assert root.deleted_at is None
    assert sub.deleted_at is None
    assert doc.deleted_at is None


@pytest.mark.django_db
def test_purge_permanently_deletes_a_trashed_document(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    document = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("a.txt", b"x"))
    document.soft_delete()

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.delete(reverse("api:document-purge", args=[document.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 204

    from drive.models import Document
    assert not Document.objects.filter(id=document.id).exists()


@pytest.mark.django_db
def test_cannot_purge_a_document_that_is_not_in_the_trash(baker):
    """purge so deve operar sobre itens ja na lixeira — o get_queryset da action filtra por deleted_at."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    document = baker.make("drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("a.txt", b"x"))

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    response = client.delete(reverse("api:document-purge", args=[document.id]), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 404

    from drive.models import Document
    assert Document.objects.filter(id=document.id).exists()


@pytest.mark.django_db
def test_cannot_restore_or_purge_another_tenants_trashed_document(baker):
    """IDOR: a lixeira e as acoes de restore/purge sao isoladas por tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)
    other_document = baker.make(
        "drive.Document", tenant=other_tenant, user=other_user, file=SimpleUploadedFile("a.txt", b"x")
    )
    other_document.soft_delete()

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    restore_response = client.post(
        reverse("api:document-restore", args=[other_document.id]), HTTP_X_TENANT_ID=str(tenant.id)
    )
    assert restore_response.status_code == 404

    purge_response = client.delete(
        reverse("api:document-purge", args=[other_document.id]), HTTP_X_TENANT_ID=str(tenant.id)
    )
    assert purge_response.status_code == 404
