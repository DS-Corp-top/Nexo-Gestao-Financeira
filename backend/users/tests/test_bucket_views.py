import os
import tempfile
from pathlib import Path

import pytest
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from users.bucket_views import _human_size, _local_list, _local_stats, _local_delete

pytestmark = pytest.mark.django_db


# ─── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def superuser(baker):
    user = baker.make("auth.User", is_superuser=True, is_active=True)
    user.set_password("pass")
    user.save()
    return user


@pytest.fixture
def regular_user(baker):
    user = baker.make("auth.User", is_superuser=False, is_active=True)
    user.set_password("pass")
    user.save()
    return user


@pytest.fixture
def su_client(superuser):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    return client


@pytest.fixture
def regular_client(regular_user):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=regular_user)
    return client


@pytest.fixture
def anon_client():
    return APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")


@pytest.fixture
def media_tree(tmp_path):
    """Create a realistic media directory tree for testing."""
    # drive/tenant_1/company_1/doc.pdf
    (tmp_path / "drive" / "tenant_1" / "company_1").mkdir(parents=True)
    (tmp_path / "drive" / "tenant_1" / "company_1" / "doc.pdf").write_bytes(b"x" * 1024)
    (tmp_path / "drive" / "tenant_1" / "company_1" / "photo.jpg").write_bytes(b"x" * 2048)

    # drive/tenant_1/geral/
    (tmp_path / "drive" / "tenant_1" / "geral").mkdir(parents=True)
    (tmp_path / "drive" / "tenant_1" / "geral" / "readme.txt").write_bytes(b"hello")

    # drive/tenant_2/
    (tmp_path / "drive" / "tenant_2").mkdir(parents=True)
    (tmp_path / "drive" / "tenant_2" / "planilha.xlsx").write_bytes(b"x" * 512)

    # tenants/slug/logo/
    (tmp_path / "tenants" / "minha-empresa" / "logo").mkdir(parents=True)
    (tmp_path / "tenants" / "minha-empresa" / "logo" / "logo.png").write_bytes(b"x" * 4096)

    # todos/
    (tmp_path / "todos").mkdir(parents=True)
    (tmp_path / "todos" / "attachment.zip").write_bytes(b"x" * 8192)

    return tmp_path


# ─── Unit tests: _human_size ───────────────────────────────────────────────────

def test_human_size_bytes():
    assert _human_size(0) == "0 B"
    assert _human_size(500) == "500 B"
    assert _human_size(1023) == "1023 B"


def test_human_size_kilobytes():
    assert _human_size(1024) == "1.0 KB"
    assert _human_size(1536) == "1.5 KB"


def test_human_size_megabytes():
    assert _human_size(1048576) == "1.0 MB"


def test_human_size_gigabytes():
    assert _human_size(1073741824) == "1.0 GB"


# ─── Unit tests: _local_list ──────────────────────────────────────────────────

def test_local_list_root(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        folders, files = _local_list("")

    folder_names = [f["name"] for f in folders]
    assert "drive" in folder_names
    assert "tenants" in folder_names
    assert "todos" in folder_names
    assert len(files) == 0  # no files at root level


def test_local_list_subfolder(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        folders, files = _local_list("drive/tenant_1/company_1")

    assert len(folders) == 0
    file_names = [f["name"] for f in files]
    assert "doc.pdf" in file_names
    assert "photo.jpg" in file_names


def test_local_list_nonexistent_prefix(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        folders, files = _local_list("does/not/exist")

    assert folders == []
    assert files == []


def test_local_list_folder_metadata(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        folders, _ = _local_list("")

    drive_folder = next(f for f in folders if f["name"] == "drive")
    assert drive_folder["type"] == "folder"
    assert drive_folder["key"] == "drive/"
    assert drive_folder["children_count"] > 0
    assert drive_folder["size"] > 0
    assert isinstance(drive_folder["size_display"], str)


def test_local_list_file_metadata(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        _, files = _local_list("drive/tenant_1/company_1")

    pdf = next(f for f in files if f["name"] == "doc.pdf")
    assert pdf["type"] == "file"
    assert pdf["key"] == "drive/tenant_1/company_1/doc.pdf"
    assert pdf["size"] == 1024
    assert pdf["size_display"] == "1.0 KB"
    assert pdf["modified"] is not None


# ─── Unit tests: _local_stats ─────────────────────────────────────────────────

def test_local_stats(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        stats = _local_stats()

    assert stats["total_files"] == 6  # doc.pdf, photo.jpg, readme.txt, planilha.xlsx, logo.png, attachment.zip
    assert stats["total_size"] == 1024 + 2048 + 5 + 512 + 4096 + 8192
    assert "total_size_display" in stats
    assert isinstance(stats["type_breakdown"], dict)
    assert "pdf" in stats["type_breakdown"]
    assert "jpg" in stats["type_breakdown"]
    assert len(stats["top_folders"]) > 0


def test_local_stats_top_folders_sorted_by_size(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        stats = _local_stats()

    sizes = [f["size"] for f in stats["top_folders"]]
    assert sizes == sorted(sizes, reverse=True)


def test_local_stats_empty_media(tmp_path):
    empty_dir = tmp_path / "empty_media"
    empty_dir.mkdir()
    with override_settings(MEDIA_ROOT=empty_dir):
        stats = _local_stats()

    assert stats["total_files"] == 0
    assert stats["total_size"] == 0


def test_local_stats_nonexistent_media(tmp_path):
    with override_settings(MEDIA_ROOT=tmp_path / "nonexistent"):
        stats = _local_stats()

    assert stats["total_files"] == 0
    assert stats["total_size"] == 0


# ─── Unit tests: _local_delete ─────────────────────────────────────────────────

def test_local_delete_success(media_tree):
    target = media_tree / "todos" / "attachment.zip"
    assert target.exists()

    with override_settings(MEDIA_ROOT=media_tree):
        result = _local_delete("todos/attachment.zip")

    assert result is True
    assert not target.exists()


def test_local_delete_nonexistent_file(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        result = _local_delete("does/not/exist.txt")

    assert result is False


def test_local_delete_directory_rejected(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        result = _local_delete("drive/tenant_1")

    assert result is False  # must be a file, not dir


def test_local_delete_path_traversal_blocked(media_tree):
    with override_settings(MEDIA_ROOT=media_tree):
        result = _local_delete("../../../etc/passwd")

    assert result is False


# ─── API integration tests: BucketListView ─────────────────────────────────────

def test_bucket_list_requires_superuser(regular_client):
    url = reverse("api:system_bucket_list")
    response = regular_client.get(url)
    assert response.status_code == 403


def test_bucket_list_requires_authentication(anon_client):
    url = reverse("api:system_bucket_list")
    response = anon_client.get(url)
    assert response.status_code == 401


def test_bucket_list_root(su_client, media_tree):
    url = reverse("api:system_bucket_list")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.get(url)

    assert response.status_code == 200
    data = response.json()
    assert "provider" in data
    assert "breadcrumbs" in data
    assert "folders" in data
    assert "files" in data
    assert data["prefix"] == ""
    folder_names = [f["name"] for f in data["folders"]]
    assert "drive" in folder_names


def test_bucket_list_with_prefix(su_client, media_tree):
    url = reverse("api:system_bucket_list")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.get(url, {"prefix": "drive/tenant_1/company_1"})

    assert response.status_code == 200
    data = response.json()
    file_names = [f["name"] for f in data["files"]]
    assert "doc.pdf" in file_names
    assert "photo.jpg" in file_names
    assert len(data["folders"]) == 0


def test_bucket_list_breadcrumbs(su_client, media_tree):
    url = reverse("api:system_bucket_list")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.get(url, {"prefix": "drive/tenant_1"})

    data = response.json()
    assert len(data["breadcrumbs"]) == 3  # Raiz, drive, tenant_1
    assert data["breadcrumbs"][0]["name"] == "Raiz"
    assert data["breadcrumbs"][1]["name"] == "drive"
    assert data["breadcrumbs"][2]["name"] == "tenant_1"


def test_bucket_list_empty_prefix(su_client, media_tree):
    url = reverse("api:system_bucket_list")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.get(url, {"prefix": "nonexistent/path"})

    assert response.status_code == 200
    data = response.json()
    assert data["folders"] == []
    assert data["files"] == []


# ─── API integration tests: BucketStatsView ────────────────────────────────────

def test_bucket_stats_requires_superuser(regular_client):
    url = reverse("api:system_bucket_stats")
    response = regular_client.get(url)
    assert response.status_code == 403


def test_bucket_stats_requires_authentication(anon_client):
    url = reverse("api:system_bucket_stats")
    response = anon_client.get(url)
    assert response.status_code == 401


def test_bucket_stats_local(su_client, media_tree):
    url = reverse("api:system_bucket_stats")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.get(url)

    assert response.status_code == 200
    data = response.json()
    assert data["total_files"] == 6
    assert data["total_size"] > 0
    assert "total_size_display" in data
    assert "type_breakdown" in data
    assert "top_folders" in data
    assert "provider" in data
    assert "media_root" in data


def test_bucket_stats_cloud_returns_note(su_client):
    url = reverse("api:system_bucket_stats")
    with override_settings(STORAGE_PROVIDER="s3"):
        response = su_client.get(url)

    assert response.status_code == 200
    data = response.json()
    assert "note" in data


# ─── API integration tests: BucketDeleteView ──────────────────────────────────

def test_bucket_delete_requires_superuser(regular_client):
    url = reverse("api:system_bucket_delete")
    response = regular_client.delete(url, {"key": "test.txt"})
    assert response.status_code == 403


def test_bucket_delete_requires_authentication(anon_client):
    url = reverse("api:system_bucket_delete")
    response = anon_client.delete(url, {"key": "test.txt"})
    assert response.status_code == 401


def test_bucket_delete_requires_key_param(su_client):
    url = reverse("api:system_bucket_delete")
    with override_settings(STORAGE_PROVIDER="local"):
        response = su_client.delete(url)

    assert response.status_code == 400
    assert "key" in response.json()["detail"].lower()


def test_bucket_delete_success(su_client, media_tree):
    url = reverse("api:system_bucket_delete")
    key = "todos/attachment.zip"
    assert (media_tree / key).exists()

    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.delete(f"{url}?key={key}")

    assert response.status_code == 200
    assert not (media_tree / key).exists()


def test_bucket_delete_nonexistent_returns_404(su_client, media_tree):
    url = reverse("api:system_bucket_delete")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.delete(f"{url}?key=does/not/exist.txt")

    assert response.status_code == 404


def test_bucket_delete_path_traversal_blocked(su_client, media_tree):
    url = reverse("api:system_bucket_delete")
    with override_settings(MEDIA_ROOT=media_tree, STORAGE_PROVIDER="local"):
        response = su_client.delete(f"{url}?key=../../etc/passwd")

    assert response.status_code == 400
