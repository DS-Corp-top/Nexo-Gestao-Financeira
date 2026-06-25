from decimal import Decimal

from django.contrib.auth.mixins import LoginRequiredMixin
from django.db.models import DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.urls import reverse, reverse_lazy
from django.views import View
from django.views.generic import CreateView, DeleteView, DetailView, ListView, UpdateView

from common.mixins import UserAssignMixin, UserQuerySetMixin
from common.security import resolve_safe_redirect_url
from shopping.forms import ShoppingItemForm, ShoppingListForm
from shopping.models import ShoppingItem, ShoppingList


class ShoppingItemFormKwargsMixin:
    def get_selected_list(self):
        list_pk = (
            self.request.GET.get("list")
            or self.request.POST.get("list")
            or self.request.GET.get("shopping_list")
            or self.request.POST.get("shopping_list")
        )
        if not list_pk:
            return None
        return get_object_or_404(ShoppingList, pk=list_pk, tenant=self.request.tenant)

    def get_form_kwargs(self):
        kwargs = super().get_form_kwargs()
        kwargs["user"] = self.request.user
        kwargs["tenant"] = self.request.tenant
        kwargs["selected_list"] = self.get_selected_list()
        return kwargs


class ShoppingRedirectMixin:
    def resolve_next_url(self, fallback_url):
        next_url = (
            self.request.POST.get("next")
            or self.request.GET.get("next")
            or ""
        )
        return resolve_safe_redirect_url(self.request, next_url, fallback_url)


class ShoppingListView(UserQuerySetMixin, ListView):
    model = ShoppingList
    template_name = "shopping/shopping_list.html"
    context_object_name = "shopping_lists"

    def get_queryset(self):
        return super().get_queryset().prefetch_related("items")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        items_qs = ShoppingItem.objects.filter(tenant=self.request.tenant)
        purchased_qs = items_qs.filter(is_purchased=True)

        total_expr = ExpressionWrapper(
            Coalesce(F("unit_price"), Value(Decimal("0.00"))) * F("quantity"),
            output_field=DecimalField(max_digits=14, decimal_places=2),
        )

        purchased_total = purchased_qs.aggregate(
            total=Coalesce(Sum(total_expr), Decimal("0.00"))
        )["total"]

        context.update(
            {
                "total_lists": self.object_list.count(),
                "pending_count": items_qs.filter(is_purchased=False).count(),
                "purchased_count": purchased_qs.count(),
                "purchased_total": purchased_total,
            }
        )
        return context


class ShoppingListDetailView(UserQuerySetMixin, DetailView):
    model = ShoppingList
    template_name = "shopping/shopping_detail.html"
    context_object_name = "shopping_list"

    def get_queryset(self):
        return super().get_queryset().prefetch_related("items")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        items = list(self.object.items.all())
        context.update(
            {
                "items": items,
                "pending_count": sum(1 for item in items if not item.is_purchased),
                "purchased_count": sum(1 for item in items if item.is_purchased),
                "purchased_total": sum(
                    (item.estimated_total for item in items if item.is_purchased),
                    Decimal("0.00"),
                ).quantize(Decimal("0.01")),
                "list_return_url": reverse("shopping:detail", args=[self.object.pk]),
            }
        )
        return context


class ShoppingListCreateView(UserAssignMixin, CreateView):
    model = ShoppingList
    form_class = ShoppingListForm
    template_name = "shopping/shopping_list_form.html"
    success_url = reverse_lazy("shopping:list")


class ShoppingListUpdateView(ShoppingRedirectMixin, UserQuerySetMixin, UpdateView):
    model = ShoppingList
    form_class = ShoppingListForm
    template_name = "shopping/shopping_list_form.html"

    def get_success_url(self):
        fallback_url = reverse("shopping:detail", args=[self.object.pk])
        return self.resolve_next_url(fallback_url)


class ShoppingListDeleteView(ShoppingRedirectMixin, UserQuerySetMixin, DeleteView):
    model = ShoppingList
    template_name = "shopping/shopping_list_confirm_delete.html"
    success_url = reverse_lazy("shopping:list")

    def get_success_url(self):
        return self.resolve_next_url(str(self.success_url))


class ShoppingItemCreateView(
    ShoppingItemFormKwargsMixin,
    ShoppingRedirectMixin,
    UserAssignMixin,
    CreateView,
):
    model = ShoppingItem
    form_class = ShoppingItemForm
    template_name = "shopping/shopping_form.html"

    def get_success_url(self):
        fallback_url = reverse("shopping:detail", args=[self.object.shopping_list_id])
        return self.resolve_next_url(fallback_url)


class ShoppingItemUpdateView(
    ShoppingItemFormKwargsMixin,
    ShoppingRedirectMixin,
    UserQuerySetMixin,
    UpdateView,
):
    model = ShoppingItem
    form_class = ShoppingItemForm
    template_name = "shopping/shopping_form.html"

    def get_success_url(self):
        fallback_url = reverse("shopping:detail", args=[self.object.shopping_list_id])
        return self.resolve_next_url(fallback_url)


class ShoppingItemDeleteView(ShoppingRedirectMixin, UserQuerySetMixin, DeleteView):
    model = ShoppingItem
    template_name = "shopping/shopping_confirm_delete.html"

    def get_success_url(self):
        fallback_url = reverse("shopping:detail", args=[self.object.shopping_list_id])
        return self.resolve_next_url(fallback_url)


class ShoppingItemTogglePurchasedView(LoginRequiredMixin, View):
    success_url = reverse_lazy("shopping:list")

    def post(self, request, *args, **kwargs):
        item = get_object_or_404(ShoppingItem, pk=kwargs.get("pk"), tenant=request.tenant)
        item.toggle_purchased()
        item.save(update_fields=["is_purchased", "purchased_at", "updated_at"])

        fallback_url = reverse("shopping:detail", args=[item.shopping_list_id])
        next_url = (request.POST.get("next") or "").strip()
        next_url = resolve_safe_redirect_url(
            request,
            next_url,
            fallback_url or str(self.success_url),
        )

        if request.headers.get("HX-Request") == "true":
            response = HttpResponse(status=204)
            response["HX-Redirect"] = next_url
            return response

        return HttpResponseRedirect(next_url)
