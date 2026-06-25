from calendar import monthrange
from datetime import timedelta

from django.db import migrations


def _add_months_safe(base_date, month_delta):
    serial = base_date.year * 12 + (base_date.month - 1) + month_delta
    target_year, target_month_idx = divmod(serial, 12)
    target_month = target_month_idx + 1
    target_day = min(base_date.day, monthrange(target_year, target_month)[1])
    return base_date.replace(year=target_year, month=target_month, day=target_day)


def _add_interval_safe(base_date, interval_value, interval_unit):
    interval = max(1, int(interval_value or 1))
    if interval_unit == "day":
        return base_date + timedelta(days=interval)
    if interval_unit == "year":
        return _add_months_safe(base_date, interval * 12)
    return _add_months_safe(base_date, interval)


def backfill_installment_numbers(apps, schema_editor):
    Transaction = apps.get_model("transactions", "Transaction")

    queryset = (
        Transaction.objects.filter(
            recurrence_type="installment",
            installment_count__isnull=False,
        )
        .order_by(
            "user_id",
            "transaction_type",
            "amount",
            "account_id",
            "destination_account_id",
            "category_id",
            "description",
            "recurrence_interval",
            "recurrence_interval_unit",
            "date",
            "pk",
        )
    )

    updates = []
    current_key = None
    current_number = 0
    previous_date = None
    previous_count = 1
    previous_interval = 1
    previous_unit = "month"

    for tx in queryset.iterator(chunk_size=500):
        key = (
            tx.user_id,
            tx.transaction_type,
            tx.amount,
            tx.account_id,
            tx.destination_account_id,
            tx.category_id,
            tx.description,
            tx.recurrence_interval or 1,
            tx.recurrence_interval_unit or "month",
            tx.installment_count or 1,
        )

        if key != current_key:
            current_number = 1
        else:
            expected_date = _add_interval_safe(
                previous_date,
                previous_interval,
                previous_unit,
            )
            if tx.date == expected_date and current_number < previous_count:
                current_number += 1
            else:
                current_number = 1

        if tx.installment_number != current_number:
            tx.installment_number = current_number
            updates.append(tx)
            if len(updates) >= 500:
                Transaction.objects.bulk_update(
                    updates,
                    ["installment_number"],
                    batch_size=500,
                )
                updates = []

        current_key = key
        previous_date = tx.date
        previous_count = key[-1]
        previous_interval = key[7]
        previous_unit = key[8]

    if updates:
        Transaction.objects.bulk_update(
            updates,
            ["installment_number"],
            batch_size=500,
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("transactions", "0008_transaction_installment_number"),
    ]

    operations = [
        migrations.RunPython(backfill_installment_numbers, noop_reverse),
    ]
