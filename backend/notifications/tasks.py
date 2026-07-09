import json
import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from pywebpush import WebPushException, webpush

from notifications.models import PushSubscription
from tenants.models import Tenant
from transactions.models import Transaction

logger = logging.getLogger(__name__)


def _send_to_subscription(subscription, payload):
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": settings.VAPID_CLAIMS_EMAIL},
        )
        return True
    except WebPushException as exc:
        status_code = getattr(exc.response, "status_code", None)
        if status_code in (404, 410):
            # Subscription expired or was revoked by the browser — stop
            # targeting it instead of failing on every future run.
            subscription.delete()
        else:
            logger.warning("Falha ao enviar push para %s: %s", subscription.endpoint, exc)
        return False


@shared_task
def send_due_expense_reminders():
    """Notify each tenant's subscribed devices about expenses due today or overdue.

    Runs once a day (see CELERY_BEAT_SCHEDULE). Groups pending expenses by
    tenant so each user gets a single summary notification instead of one
    push per transaction.
    """
    if not settings.VAPID_PRIVATE_KEY:
        logger.info("VAPID_PRIVATE_KEY nao configurada — pulando envio de push.")
        return 0

    today = timezone.localdate()
    sent = 0

    tenant_ids = (
        PushSubscription.objects.values_list("tenant_id", flat=True).distinct()
    )
    for tenant_id in tenant_ids:
        due_qs = Transaction.objects.filter(
            tenant_id=tenant_id,
            transaction_type=Transaction.TransactionType.EXPENSE,
            is_cleared=False,
            is_ignored=False,
            date__lte=today,
        )
        due_count = due_qs.count()
        if not due_count:
            continue
        overdue_count = due_qs.filter(date__lt=today).count()

        if overdue_count:
            title = "Contas vencidas"
            body = f"Você tem {overdue_count} conta(s) vencida(s) e {due_count} pendente(s) no total."
        else:
            title = "Contas vencendo hoje"
            body = f"Você tem {due_count} conta(s) vencendo hoje."

        payload = {
            "title": title,
            "body": body,
            "url": "/transactions",
        }

        for subscription in PushSubscription.objects.filter(tenant_id=tenant_id):
            if _send_to_subscription(subscription, payload):
                sent += 1

    return sent
