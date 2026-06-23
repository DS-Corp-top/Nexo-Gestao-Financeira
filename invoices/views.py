from django.contrib import messages
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect
from django.urls import reverse, reverse_lazy
from django.views.generic import CreateView, DeleteView, DetailView, ListView, UpdateView, View

from common.mixins import UserAssignMixin, UserQuerySetMixin
from invoices.forms import ClientForm, InvoiceForm, InvoicePayForm
from invoices.models import Client, Invoice
from invoices.service_codes import SERVICE_CODES
from transactions.models import Transaction


class InvoiceListView(UserQuerySetMixin, ListView):
    model = Invoice
    template_name = "invoices/invoice_list.html"
    context_object_name = "invoices"

    def get_queryset(self):
        qs = super().get_queryset()
        status = self.request.GET.get("status")
        if status in (Invoice.DRAFT, Invoice.ISSUED, Invoice.PAID, Invoice.CANCELLED):
            qs = qs.filter(status=status)
        return qs

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["active_status"] = self.request.GET.get("status", "")
        ctx["status_choices"] = Invoice.STATUS_CHOICES
        return ctx


class InvoiceCreateView(UserAssignMixin, CreateView):
    model = Invoice
    form_class = InvoiceForm
    template_name = "invoices/invoice_form.html"

    def form_valid(self, form):
        form.instance.number = Invoice.next_number(self.request.tenant)
        form.instance.status = Invoice.ISSUED
        return super().form_valid(form)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_codes"] = SERVICE_CODES
        return ctx

    def get_success_url(self):
        return reverse("invoices:detail", kwargs={"pk": self.object.pk})


class InvoiceDetailView(UserQuerySetMixin, DetailView):
    model = Invoice
    template_name = "invoices/invoice_detail.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        if self.object.status == Invoice.ISSUED:
            ctx["pay_form"] = InvoicePayForm(tenant=self.request.tenant)
        return ctx


class InvoiceUpdateView(UserQuerySetMixin, UserAssignMixin, UpdateView):
    model = Invoice
    form_class = InvoiceForm
    template_name = "invoices/invoice_form.html"

    def get_queryset(self):
        return super().get_queryset().filter(status=Invoice.ISSUED)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["service_codes"] = SERVICE_CODES
        return ctx

    def get_success_url(self):
        return reverse("invoices:detail", kwargs={"pk": self.object.pk})


class InvoiceDeleteView(UserQuerySetMixin, DeleteView):
    model = Invoice
    template_name = "invoices/invoice_confirm_delete.html"
    success_url = reverse_lazy("invoices:list")

    def get_queryset(self):
        return super().get_queryset().filter(status=Invoice.ISSUED)


class InvoicePayView(UserQuerySetMixin, View):
    def post(self, request, pk):
        invoice = get_object_or_404(
            self.get_queryset(), pk=pk, status=Invoice.ISSUED
        )
        form = InvoicePayForm(request.POST, tenant=request.tenant)
        if not form.is_valid():
            messages.error(request, "Preencha a conta e a data de recebimento.")
            return redirect("invoices:detail", pk=pk)

        txn = Transaction.objects.create(
            user=request.user,
            tenant=request.tenant,
            transaction_type=Transaction.INCOME,
            amount=invoice.net_value,
            date=form.cleaned_data["paid_at"],
            account=form.cleaned_data["account"],
            description=f"NFS-e {invoice.number_display} — {invoice.client_name}",
            is_cleared=True,
            recurrence_type=Transaction.ONCE,
        )
        invoice.status = Invoice.PAID
        invoice.paid_at = form.cleaned_data["paid_at"]
        invoice.transaction = txn
        invoice.save(update_fields=["status", "paid_at", "transaction", "updated_at"])
        messages.success(
            request,
            f"Nota {invoice.number_display} marcada como paga. Receita lançada.",
        )
        return redirect("invoices:detail", pk=pk)

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user, tenant=self.request.tenant)


class InvoiceCancelView(UserQuerySetMixin, View):
    def post(self, request, pk):
        invoice = get_object_or_404(self.get_queryset(), pk=pk)
        if invoice.status == Invoice.PAID:
            messages.error(request, "Nota paga não pode ser cancelada.")
            return redirect("invoices:detail", pk=pk)
        invoice.status = Invoice.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
        messages.success(request, f"Nota {invoice.number_display} cancelada.")
        return redirect("invoices:list")

    def get_queryset(self):
        return Invoice.objects.filter(user=self.request.user, tenant=self.request.tenant)


class ClientSearchView(View):
    def get(self, request):
        if not request.user.is_authenticated:
            return HttpResponse("", content_type="text/html")
        q = request.GET.get("q", "").strip()
        clients = Client.objects.filter(user=request.user, tenant=request.tenant).order_by("name")
        if q:
            clients = clients.filter(name__icontains=q)
        clients = clients[:10]
        from django.template.loader import render_to_string
        html = render_to_string(
            "invoices/partials/client_search_results.html",
            {"clients": clients, "q": q},
            request=request,
        )
        return HttpResponse(html, content_type="text/html")


class ClientPrefillView(View):
    def get(self, request, pk):
        client = get_object_or_404(Client, pk=pk, user=request.user, tenant=request.tenant)
        from django.template.loader import render_to_string
        html = render_to_string(
            "invoices/partials/client_fields.html",
            {"client": client},
            request=request,
        )
        return HttpResponse(html, content_type="text/html")


class ClientCreateView(UserAssignMixin, CreateView):
    model = Client
    form_class = ClientForm
    template_name = "invoices/client_form.html"
    success_url = reverse_lazy("invoices:create")

    def form_valid(self, form):
        messages.success(self.request, "Cliente salvo com sucesso.")
        return super().form_valid(form)


class ClientListView(UserQuerySetMixin, ListView):
    model = Client
    template_name = "invoices/client_list.html"
    context_object_name = "clients"


class CnpjLookupView(View):
    def get(self, request, cnpj):
        import re
        import requests as req
        from django.http import JsonResponse

        digits = re.sub(r"\D", "", cnpj)
        if len(digits) != 14:
            return JsonResponse({"error": "CNPJ inválido."}, status=400)

        try:
            resp = req.get(
                f"https://brasilapi.com.br/api/cnpj/v1/{digits}",
                timeout=8,
                headers={"User-Agent": "Nexo-Gestao/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return JsonResponse({"error": "Não foi possível consultar o CNPJ."}, status=502)

        address_parts = filter(None, [
            data.get("logradouro"),
            data.get("numero"),
            data.get("complemento"),
            data.get("bairro"),
        ])
        city_parts = filter(None, [data.get("municipio"), data.get("uf")])

        return JsonResponse({
            "name": data.get("razao_social") or data.get("nome_fantasia") or "",
            "email": data.get("email") or "",
            "address": ", ".join(address_parts),
            "city": " / ".join(city_parts),
        })
