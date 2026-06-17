import json

from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import HttpResponse
from django.shortcuts import render
from django.urls import reverse_lazy
from django.views import View
from django.views.generic import CreateView, DeleteView, ListView, UpdateView

from accounts.forms import AccountForm, CreditLimitForm
from accounts.models import Account
from common.mixins import UserAssignMixin, UserQuerySetMixin


class CreditLimitUpdateView(LoginRequiredMixin, View):
    template_name = "accounts/credit_limit_modal.html"

    def get(self, request, *args, **kwargs):
        form = CreditLimitForm(tenant=request.tenant)
        return render(request, self.template_name, {"form": form})

    def post(self, request, *args, **kwargs):
        form = CreditLimitForm(request.POST, tenant=request.tenant)
        if form.is_valid():
            account = form.cleaned_data["account"]
            account.credit_limit = form.cleaned_data["credit_limit"]
            account.save(update_fields=["credit_limit", "updated_at"])
            response = HttpResponse(status=204)
            response["HX-Trigger"] = json.dumps({"closeModal": True})
            return response
        return render(request, self.template_name, {"form": form})


class AccountListView(UserQuerySetMixin, ListView):
    model = Account
    template_name = "accounts/account_list.html"
    context_object_name = "accounts"


class AccountCreateView(UserAssignMixin, CreateView):
    model = Account
    form_class = AccountForm
    template_name = "accounts/account_form.html"
    success_url = reverse_lazy("accounts:list")


class AccountUpdateView(UserQuerySetMixin, UpdateView):
    model = Account
    form_class = AccountForm
    template_name = "accounts/account_form.html"
    success_url = reverse_lazy("accounts:list")


class AccountDeleteView(UserQuerySetMixin, DeleteView):
    model = Account
    template_name = "accounts/account_confirm_delete.html"
    success_url = reverse_lazy("accounts:list")
