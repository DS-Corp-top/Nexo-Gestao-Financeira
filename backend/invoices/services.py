from transactions.models import Transaction


def invoice_transaction_amount(invoice):
    return invoice.gross_value - invoice.deductions


def invoice_transaction_description(invoice):
    return f"Fatura {invoice.number_display} - {invoice.client_name}"


def sync_invoice_transaction(invoice, *, user, tenant, launch_financial):
    if launch_financial:
        if invoice.transaction:
            txn = invoice.transaction
            txn.amount = invoice_transaction_amount(invoice)
            txn.date = invoice.due_date or invoice.issue_date
            txn.account = invoice.expected_account
            txn.description = invoice_transaction_description(invoice)
            txn.recurrence_type = invoice.recurrence_type
            txn.recurrence_interval = invoice.recurrence_interval
            txn.recurrence_interval_unit = invoice.recurrence_interval_unit
            txn.installment_count = invoice.installment_count
            txn.save(
                update_fields=[
                    "amount",
                    "date",
                    "account",
                    "description",
                    "recurrence_type",
                    "recurrence_interval",
                    "recurrence_interval_unit",
                    "installment_count",
                ]
            )
            txn.generate_future_occurrences()
            return txn

        txn = Transaction.objects.create(
            user=user,
            tenant=tenant,
            transaction_type=Transaction.TransactionType.INCOME,
            amount=invoice_transaction_amount(invoice),
            date=invoice.due_date or invoice.issue_date,
            account=invoice.expected_account,
            description=invoice_transaction_description(invoice),
            is_cleared=False,
            recurrence_type=invoice.recurrence_type,
            recurrence_interval=invoice.recurrence_interval,
            recurrence_interval_unit=invoice.recurrence_interval_unit,
            installment_count=invoice.installment_count,
        )
        invoice.transaction = txn
        invoice.save(update_fields=["transaction"])
        txn.generate_future_occurrences()
        return txn

    if invoice.transaction and not invoice.transaction.is_cleared:
        invoice.transaction.delete()
        invoice.transaction = None
        invoice.save(update_fields=["transaction"])
    return None
