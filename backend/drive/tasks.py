import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from drive.models import Document, Folder, TRASH_RETENTION_DAYS

logger = logging.getLogger(__name__)


@shared_task
def purge_expired_trash():
    """Permanently deletes anything that's been in the Drive trash for more
    than TRASH_RETENTION_DAYS. Runs daily (see CELERY_BEAT_SCHEDULE).

    Documents are purged before folders so a folder's hard-delete cascade
    never has a chance to sweep up a document that hasn't hit its own
    30-day mark yet (only relevant if it was trashed independently of its
    folder).
    """
    cutoff = timezone.now() - timedelta(days=TRASH_RETENTION_DAYS)

    documents_deleted, _ = Document.objects.filter(
        deleted_at__isnull=False, deleted_at__lte=cutoff
    ).delete()
    folders_deleted, _ = Folder.objects.filter(
        deleted_at__isnull=False, deleted_at__lte=cutoff
    ).delete()

    logger.info(
        "purge_expired_trash: %s document(s), %s folder(s) permanently deleted",
        documents_deleted, folders_deleted,
    )
    return {"documents_deleted": documents_deleted, "folders_deleted": folders_deleted}
