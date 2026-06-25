from django import forms

from common.forms import style_form_fields
from common.tenancy import resolve_tenant
from shopping.models import ShoppingItem, ShoppingList


class ShoppingListForm(forms.ModelForm):
    class Meta:
        model = ShoppingList
        fields = ("name", "list_date", "notes")
        labels = {
            "name": "Nome da lista",
            "list_date": "Data da lista",
            "notes": "Observacao",
        }
        widgets = {
            "list_date": forms.DateInput(format="%Y-%m-%d", attrs={"type": "date"}),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form_fields(self)
        if self.instance and self.instance.pk and self.instance.list_date:
            self.initial["list_date"] = self.instance.list_date.isoformat()


class ShoppingItemForm(forms.ModelForm):
    class Meta:
        model = ShoppingItem
        fields = (
            "shopping_list",
            "title",
            "quantity",
            "unit_price",
            "notes",
            "is_purchased",
        )
        labels = {
            "shopping_list": "Lista",
            "title": "Item",
            "quantity": "Quantidade",
            "unit_price": "Preco unitario estimado",
            "notes": "Observacao",
            "is_purchased": "Ja comprado",
        }
        widgets = {
            "notes": forms.Textarea(attrs={"rows": 3}),
        }

    def __init__(self, *args, **kwargs):
        user = kwargs.pop("user")
        tenant = resolve_tenant(tenant=kwargs.pop("tenant", None), user=user)
        selected_list = kwargs.pop("selected_list", None)
        super().__init__(*args, **kwargs)
        style_form_fields(self)

        self.instance.user = user
        self.instance.tenant = tenant
        self.fields["shopping_list"].queryset = ShoppingList.objects.filter(
            tenant=tenant
        ).order_by("name")
        if selected_list and not self.is_bound:
            self.fields["shopping_list"].initial = selected_list

        self.fields["quantity"].widget.attrs.update({"min": "1", "step": "1"})
        self.fields["unit_price"].widget.attrs.update({"min": "0", "step": "0.01"})
        self.fields["unit_price"].required = False
