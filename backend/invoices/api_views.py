import re

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.models import Account
from common.api_mixins import TenantQuerySetMixin
from common.throttles import CnpjLookupThrottle
from invoices.models import Client, Invoice
from invoices.serializers import ClientSerializer, InvoicePaySerializer, InvoiceSerializer
from invoices.service_codes import SERVICE_CODES
from invoices.services import invoice_transaction_description, sync_invoice_transaction
from tenants.models import TenantMembership
from tenants.serializers import TenantCompanySerializer, TenantSerializer
from users.api_views import IsSuperuser


class InvoiceViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    permission_classes = [IsSuperuser]
    queryset = Invoice.objects.select_related("expected_account", "issuer_company").all()
    serializer_class = InvoiceSerializer
    search_fields = ("client_name", "client_document", "service_description")
    filterset_fields = {
        "status": ["exact"],
        "issue_date": ["exact", "gte", "lte"],
        "due_date": ["exact", "gte", "lte"],
    }
    ordering_fields = ("number", "issue_date", "gross_value")
    ordering = ("-number",)

    def get_queryset(self):
        queryset = super().get_queryset()
        tenant = self.get_tenant()
        membership = TenantMembership.objects.filter(user=self.request.user, tenant=tenant).first()
        is_admin = bool(
            self.request.user.is_superuser or
            (membership and membership.role in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN))
        )
        if is_admin:
            return queryset
        if not membership:
            return queryset.none()
        return queryset.filter(issuer_company__membership_accesses__membership=membership).distinct()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = self.get_tenant()
        return context

    def _service_code_description(self, invoice):
        return dict(SERVICE_CODES).get(invoice.service_code, "")

    def perform_create(self, serializer):
        tenant = self.get_tenant()
        launch_financial = serializer.validated_data.pop("launch_financial", False)
        save_client = serializer.validated_data.pop("save_client", False)
        issuer_company = serializer.validated_data.get("issuer_company")
        if issuer_company is None:
            membership = TenantMembership.objects.filter(user=self.request.user, tenant=tenant).first()
            is_admin = bool(
                self.request.user.is_superuser or
                (membership and membership.role in (TenantMembership.Role.OWNER, TenantMembership.Role.ADMIN))
            )
            if is_admin:
                issuer_company = tenant.companies.filter(is_default=True, is_active=True).first()
            elif membership:
                access = membership.company_accesses.select_related("company").filter(
                    company__is_active=True
                ).first()
                issuer_company = access.company if access else None

        invoice = serializer.save(
            user=self.request.user,
            tenant=tenant,
            issuer_company=issuer_company,
            number=Invoice.next_number(tenant),
            status=Invoice.ISSUED,
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

        sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=tenant,
            launch_financial=launch_financial,
        )

    def perform_update(self, serializer):
        # Business rule: only issued invoices can be edited.
        if serializer.instance.status != Invoice.ISSUED:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Apenas faturas emitidas podem ser editadas."})

        launch_financial = serializer.validated_data.pop("launch_financial", None)
        serializer.validated_data.pop("save_client", None)
        if launch_financial is None:
            launch_financial = bool(serializer.instance.transaction_id)
        invoice = serializer.save()

        sync_invoice_transaction(
            invoice,
            user=self.request.user,
            tenant=self.get_tenant(),
            launch_financial=launch_financial,
        )

    def perform_destroy(self, instance):
        # Delete the uncleared linked transaction before deleting the invoice.
        # Must null out FK in memory before deleting, because OneToOneField SET_NULL only
        # updates the DB — the in-memory object still holds the stale reference.
        if instance.transaction and not instance.transaction.is_cleared:
            instance.transaction.delete()
            instance.transaction = None
        instance.delete()

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        """Mark invoice as paid and create the income transaction (mirrors InvoicePayView)."""
        invoice = self.get_object()
        if invoice.status != Invoice.ISSUED:
            return Response(
                {"detail": "Apenas faturas emitidas podem ser pagas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pay_serializer = InvoicePaySerializer(data=request.data)
        pay_serializer.is_valid(raise_exception=True)

        tenant = self.get_tenant()
        account = None
        if pay_serializer.validated_data.get("launch_financial", False):
            account = Account.objects.filter(
                tenant=tenant,
                pk=pay_serializer.validated_data["account"],
            ).first()
            if not account:
                return Response(
                    {"detail": "Conta não encontrada."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if pay_serializer.validated_data.get("launch_financial", False):
            if invoice.transaction:
                txn = invoice.transaction
                txn.is_cleared = True
                txn.date = pay_serializer.validated_data["paid_at"]
                txn.account = account
                txn.description = invoice_transaction_description(invoice)
                txn.save(update_fields=["is_cleared", "date", "account", "description", "updated_at"])
            else:
                from transactions.models import Transaction
                txn = Transaction.objects.create(
                    user=request.user,
                    tenant=tenant,
                    transaction_type=Transaction.TransactionType.INCOME,
                    amount=invoice.net_value,
                    date=pay_serializer.validated_data["paid_at"],
                    account=account,
                    description=invoice_transaction_description(invoice),
                    is_cleared=True,
                    recurrence_type=Transaction.RecurrenceType.ONCE,
                )
                invoice.transaction = txn
                invoice.save(update_fields=["transaction"])
        else:
            if invoice.transaction and not invoice.transaction.is_cleared:
                invoice.transaction.delete()
            txn = None

        invoice.status = Invoice.PAID
        invoice.paid_at = pay_serializer.validated_data["paid_at"]
        invoice.transaction = txn
        invoice.save(update_fields=["status", "paid_at", "transaction", "updated_at"])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["post"])
    def toggle_note_issued(self, request, pk=None):
        """Flip the manual "nota emitida" flag for an issued invoice."""
        invoice = self.get_object()

        if invoice.status != Invoice.ISSUED:
            return Response(
                {"detail": "Apenas faturas emitidas podem ter a nota marcada."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        invoice.note_issued = not invoice.note_issued
        invoice.save(update_fields=["note_issued", "updated_at"])

        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=["get"])
    def print_data(self, request, pk=None):
        """Return all data needed to render/print an invoice in the SPA."""
        invoice = self.get_object()
        tenant = invoice.tenant or self.get_tenant()
        issuer_company = invoice.issuer_company
        responsible = invoice.user
        return Response({
            "invoice": InvoiceSerializer(invoice).data,
            "tenant": TenantSerializer(tenant, context={"request": request}).data if tenant else None,
            "issuer_company": TenantCompanySerializer(issuer_company).data if issuer_company else None,
            "service_code_description": self._service_code_description(invoice),
            "responsible_name": f"{responsible.first_name} {responsible.last_name}".strip() if responsible else "",
        })

    @action(detail=False, methods=["get"])
    def service_codes(self, request):
        """Return the full LC 116 service code list."""
        return Response([{"code": c, "description": d} for c, d in SERVICE_CODES])

class ClientViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    permission_classes = [IsSuperuser]
    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    search_fields = ("name", "document", "email")
    ordering_fields = ("name", "created_at")
    ordering = ("name",)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, tenant=self.get_tenant())

    @action(detail=False, methods=["get"])
    def check(self, request):
        """Check if a client exists by doc or name (mirrors ClientCheckView)."""
        doc = request.query_params.get("doc", "").strip()
        name = request.query_params.get("name", "").strip()

        if not doc and not name:
            return Response({"exists": True})

        qs = Client.objects.filter(tenant=self.get_tenant())

        if doc:
            digits = re.sub(r"\D", "", doc)
            exists = qs.filter(document__icontains=digits).exists()
        else:
            exists = qs.filter(name__iexact=name).exists()

        return Response({"exists": exists})

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Search clients by name, returns JSON (mirrors ClientSearchView)."""
        q = request.query_params.get("q", "").strip()
        qs = Client.objects.filter(tenant=self.get_tenant()).order_by("name")
        if q:
            qs = qs.filter(name__icontains=q)
        serializer = ClientSerializer(qs[:10], many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def prefill(self, request, pk=None):
        """Return client data for form prefill (mirrors ClientPrefillView)."""
        client = self.get_object()
        return Response(ClientSerializer(client).data)

    @action(detail=False, methods=["get"], throttle_classes=[CnpjLookupThrottle])
    def cnpj_lookup(self, request):
        """Consult BrasilAPI for CNPJ data (mirrors CnpjLookupView)."""
        import requests as req

        cnpj = request.query_params.get("cnpj", "").strip()
        digits = re.sub(r"\D", "", cnpj)

        if len(digits) != 14:
            return Response({"error": "CNPJ inválido."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            resp = req.get(
                f"https://brasilapi.com.br/api/cnpj/v1/{digits}",
                timeout=8,
                headers={"User-Agent": "Nexo-Gestao/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return Response(
                {"error": "Não foi possível consultar o CNPJ."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        address_parts = list(filter(
            None,
            [data.get("logradouro"), data.get("numero"), data.get("complemento"), data.get("bairro")],
        ))
        city_parts = list(filter(None, [data.get("municipio"), data.get("uf")]))

        return Response({
            "name": data.get("razao_social") or data.get("nome_fantasia") or "",
            "email": data.get("email") or "",
            "phone": data.get("ddd_telefone_1") or data.get("telefone") or "",
            "address": ", ".join(address_parts),
            "city": " / ".join(city_parts),
        })
