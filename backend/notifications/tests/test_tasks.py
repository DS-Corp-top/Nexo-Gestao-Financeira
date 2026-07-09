import json
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone
from pywebpush import WebPushException

from notifications.models import PushSubscription
from notifications.tasks import send_due_expense_reminders
from transactions.models import Transaction


def _make_tenant_with_subscription(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    subscription = baker.make(
        "notifications.PushSubscription",
        user=user,
        tenant=tenant,
        endpoint="https://fcm.googleapis.com/fcm/send/task-test",
    )
    return tenant, subscription


def _make_expense(baker, tenant, *, date, is_cleared=False, is_ignored=False):
    account = baker.make("accounts.Account", tenant=tenant)
    return baker.make(
        "transactions.Transaction",
        tenant=tenant,
        account=account,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=100,
        is_cleared=is_cleared,
        is_ignored=is_ignored,
        date=date,
    )


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="")
def test_skips_when_vapid_not_configured(baker):
    _make_tenant_with_subscription(baker)

    with patch("notifications.tasks.webpush") as mocked_webpush:
        result = send_due_expense_reminders.run()

    assert result == 0
    mocked_webpush.assert_not_called()


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="dummy-private-key")
def test_sends_notification_for_expense_due_today(baker):
    tenant, subscription = _make_tenant_with_subscription(baker)
    _make_expense(baker, tenant, date=timezone.localdate())

    with patch("notifications.tasks.webpush") as mocked_webpush:
        result = send_due_expense_reminders.run()

    assert result == 1
    mocked_webpush.assert_called_once()
    call_kwargs = mocked_webpush.call_args.kwargs
    assert call_kwargs["subscription_info"]["endpoint"] == subscription.endpoint
    assert call_kwargs["vapid_private_key"] == "dummy-private-key"
    payload = json.loads(call_kwargs["data"])
    assert "vencendo hoje" in payload["body"]


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="dummy-private-key")
def test_uses_overdue_wording_when_expense_is_overdue(baker):
    tenant, _subscription = _make_tenant_with_subscription(baker)
    _make_expense(baker, tenant, date=timezone.localdate() - timedelta(days=1))

    with patch("notifications.tasks.webpush") as mocked_webpush:
        send_due_expense_reminders.run()

    payload = json.loads(mocked_webpush.call_args.kwargs["data"])
    assert payload["title"] == "Contas vencidas"


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="dummy-private-key")
def test_ignores_cleared_and_ignored_transactions(baker):
    tenant, _subscription = _make_tenant_with_subscription(baker)
    today = timezone.localdate()
    _make_expense(baker, tenant, date=today, is_cleared=True)
    _make_expense(baker, tenant, date=today, is_ignored=True)

    with patch("notifications.tasks.webpush") as mocked_webpush:
        result = send_due_expense_reminders.run()

    assert result == 0
    mocked_webpush.assert_not_called()


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="dummy-private-key")
def test_deletes_subscription_on_gone_response(baker):
    tenant, subscription = _make_tenant_with_subscription(baker)
    _make_expense(baker, tenant, date=timezone.localdate())

    gone_response = SimpleNamespace(status_code=410)
    with patch("notifications.tasks.webpush", side_effect=WebPushException("gone", response=gone_response)):
        result = send_due_expense_reminders.run()

    assert result == 0
    assert not PushSubscription.objects.filter(pk=subscription.pk).exists()


@pytest.mark.django_db
@override_settings(VAPID_PRIVATE_KEY="dummy-private-key")
def test_keeps_subscription_on_other_webpush_errors(baker):
    tenant, subscription = _make_tenant_with_subscription(baker)
    _make_expense(baker, tenant, date=timezone.localdate())

    server_error_response = SimpleNamespace(status_code=500)
    with patch("notifications.tasks.webpush", side_effect=WebPushException("boom", response=server_error_response)):
        result = send_due_expense_reminders.run()

    assert result == 0
    assert PushSubscription.objects.filter(pk=subscription.pk).exists()
