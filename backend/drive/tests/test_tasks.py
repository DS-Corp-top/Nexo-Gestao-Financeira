from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from drive.models import Document, Folder
from drive.tasks import purge_expired_trash

pytestmark = pytest.mark.django_db


def test_purge_expired_trash_deletes_items_older_than_30_days(baker):
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")

    old_document = baker.make(
        "drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("old.txt", b"x")
    )
    old_document.deleted_at = timezone.now() - timedelta(days=31)
    old_document.save(update_fields=["deleted_at"])

    old_folder = baker.make("drive.Folder", tenant=tenant, name="Pasta Antiga")
    old_folder.deleted_at = timezone.now() - timedelta(days=45)
    old_folder.save(update_fields=["deleted_at"])

    result = purge_expired_trash.run()

    assert result == {"documents_deleted": 1, "folders_deleted": 1}
    assert not Document.objects.filter(id=old_document.id).exists()
    assert not Folder.objects.filter(id=old_folder.id).exists()


def test_purge_expired_trash_leaves_recently_trashed_items_alone(baker):
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")

    recent_document = baker.make(
        "drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("recent.txt", b"x")
    )
    recent_document.deleted_at = timezone.now() - timedelta(days=5)
    recent_document.save(update_fields=["deleted_at"])

    result = purge_expired_trash.run()

    assert result == {"documents_deleted": 0, "folders_deleted": 0}
    assert Document.objects.filter(id=recent_document.id).exists()


def test_purge_expired_trash_does_not_touch_active_items(baker):
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    user = baker.make("auth.User")
    active_document = baker.make(
        "drive.Document", tenant=tenant, user=user, file=SimpleUploadedFile("active.txt", b"x")
    )

    result = purge_expired_trash.run()

    assert result == {"documents_deleted": 0, "folders_deleted": 0}
    assert Document.objects.filter(id=active_document.id).exists()
