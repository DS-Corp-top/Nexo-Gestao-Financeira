from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image


def _make_image_file(name="photo.png", size=(800, 600)):
    buffer = BytesIO()
    Image.new("RGB", size, color="red").save(buffer, format="PNG")
    buffer.seek(0)
    return SimpleUploadedFile(name, buffer.read(), content_type="image/png")


@pytest.mark.django_db
def test_uploading_an_image_generates_a_thumbnail(baker):
    """Documentos de imagem devem ganhar uma miniatura automaticamente."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")

    document = baker.make(
        "drive.Document",
        tenant=tenant,
        user=user,
        file=_make_image_file(),
    )

    assert document.thumbnail
    thumb = Image.open(document.thumbnail)
    assert thumb.format == "JPEG"
    assert thumb.width <= 300 and thumb.height <= 300


@pytest.mark.django_db
def test_uploading_a_non_image_does_not_generate_a_thumbnail(baker):
    """Documentos que nao sao imagem (ex: .txt) nao devem ganhar miniatura."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")

    document = baker.make(
        "drive.Document",
        tenant=tenant,
        user=user,
        file=SimpleUploadedFile("nota.txt", b"conteudo qualquer"),
    )

    assert not document.thumbnail


@pytest.mark.django_db
def test_corrupt_file_with_image_extension_skips_thumbnail_without_crashing(baker):
    """Um arquivo com extensao de imagem mas conteudo invalido nao deve travar o save()."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")

    document = baker.make(
        "drive.Document",
        tenant=tenant,
        user=user,
        file=SimpleUploadedFile("fake.png", b"isso nao e uma imagem de verdade"),
    )

    assert document.id is not None
    assert not document.thumbnail


@pytest.mark.django_db
def test_folder_creation(baker):
    """Pasta deve ser criada com nome correto."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    folder = baker.make("drive.Folder", tenant=tenant, name="Documentos Fiscais")

    assert folder.id is not None
    assert folder.name == "Documentos Fiscais"
    assert str(folder) == "Documentos Fiscais"


@pytest.mark.django_db
def test_folder_ordering(baker):
    """Pastas devem ser ordenadas por nome."""
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("drive.Folder", tenant=tenant, name="Zeta")
    baker.make("drive.Folder", tenant=tenant, name="Alpha")
    baker.make("drive.Folder", tenant=tenant, name="Medio")

    from drive.models import Folder
    folders = list(Folder.objects.filter(tenant=tenant).values_list("name", flat=True))
    assert folders == sorted(folders)
