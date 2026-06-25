from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account
from common.api_mixins import TenantQuerySetMixin
from invoices.models import Client, Invoice
from invoices.serializers import ClientSerializer, InvoicePaySerializer, InvoiceSerializer
from invoices.views import _sync_invoice_transaction


class InvoiceViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("expected_account").all()
    serializer_class = InvoiceSerializer
    search_fields = ("client_name", "client_document", "service_description")
    filterset_fields = {
        "status": ["exact"],
        "issue_date": ["exact", "gte", "lte"],
        "due_date": ["exact", "gte", "lte"],
    }
    ordering_fields = ("number", "issue_date", "gross_value")
    ordering = ("-number",)

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        launch_financial = serializer.validated_data.pop("launch_financial", False)
        save_client = serializer.validated_data.pop("save_client", False)

        invoice = serializer.save(
            user=self.request.user,
            tenant=tenant,
            number=Invoice.next_number(tenant),
        )

        if save_client and invoice.client_document:
            Client.objects.get_or_create(
                user=self.request.user,
                tenant=tenant,
                document=invoice.client_document,
                defaults={
                    "name": invoice.client_name,
                    "email": invoice.client_email,
                    "address": invoice.client_address,
                    "city": invoice.client_city,
                },
            )

        _sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=tenant,
            launch_financial=launch_financial,
        )

    def perform_update(self, serializer):
        launch_financial = serializer.validated_data.pop("launch_financial", False)
        serializer.validated_data.pop("save_client", None)
        invoice = serializer.save()

        _sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=self.get_tenant(),
            launch_financial=launch_financial,
        )

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Mark invoice as paid and create the income transaction."""
        invoice = self.get_object()
        if invoice.status != Invoice.ISSUED:
            return Response(
                {"detail": "Apenas faturas emitidas podem ser pagas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pay_serializer = InvoicePaySerializer(data=request.data)
        pay_serializer.is_valid(raise_exception=True)

        tenant = self.get_tenant()
        account = Account.objects.filter(
            tenant=tenant,
            pk=pay_serializer.validated_data["account"],
        ).first()
        if not account:
            return Response(
                {"detail": "Conta não encontrada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice.status = Invoice.PAID
        invoice.paid_at = pay_serializer.validated_data["paid_at"]
        invoice.expected_account = account
        invoice.save(update_fields=["status", "paid_at", "expected_account", "updated_at"])

        if pay_serializer.validated_data.get("launch_financial", False):
            from invoices.views import _invoice_transaction_description
            if invoice.transaction:
                txn = invoice.transaction
                txn.is_cleared = True
                txn.date = pay_serializer.validated_data["paid_at"]
                txn.account = account
                txn.description = _invoice_transaction_description(invoice)
                txn.save(
                    update_fields=[
                        "is_cleared",
                        "date",
                        "account",
                        "description",
                        "updated_at",
                    ]
                )
            else:
                from transactions.models import Transaction
                txn = Transaction.objects.create(
                    user=self.request.user,
                    tenant=tenant,
                    transaction_type=Transaction.TransactionType.INCOME,
                    amount=invoice.net_value,
                    date=pay_serializer.validated_data["paid_at"],
                    account=account,
                    description=_invoice_transaction_description(invoice),
                    is_cleared=True,
                    recurrence_type=Transaction.RecurrenceType.ONCE,
                )
                invoice.transaction = txn
                invoice.save(update_fields=["transaction"])
        else:
            if invoice.transaction and not invoice.transaction.is_cleared:
                invoice.transaction.delete()
                invoice.transaction = None
                invoice.save(update_fields=["transaction"])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancel an invoice."""
        invoice = self.get_object()
        if invoice.status == Invoice.CANCELLED:
            return Response(
                {"detail": "Fatura já cancelada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice.status = Invoice.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])

        if invoice.transaction and not invoice.transaction.is_cleared:
            invoice.transaction.delete()
            invoice.transaction = None
            invoice.save(update_fields=["transaction"])

        return Response(InvoiceSerializer(invoice).data)


class ClientViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    search_fields = ("name", "document", "email")
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

