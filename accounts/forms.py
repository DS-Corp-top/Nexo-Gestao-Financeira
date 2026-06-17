from decimal import Decimal

from django import forms

from accounts.models import Account
from common.forms import style_form_fields


class CreditLimitForm(forms.Form):
    account = forms.ModelChoiceField(
        queryset=Account.objects.none(),
        label="Cartão",
        empty_label="Selecione o cartão",
    )
    credit_limit = forms.DecimalField(
        label="Novo limite",
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )

    def __init__(self, *args, tenant=None, **kwargs):
        super().__init__(*args, **kwargs)
        if tenant:
            self.fields["account"].queryset = Account.objects.filter(
                tenant=tenant,
                account_type=Account.AccountType.CARD,
                is_active=True,
            )
        style_form_fields(self)


class AccountForm(forms.ModelForm):
    class Meta:
        model = Account
        fields = (
            "name",
            "account_type",
            "initial_balance",
            "include_in_balance",
            "is_active",
        )
        labels = {
            "name": "Nome da conta",
            "account_type": "Tipo",
            "initial_balance": "Saldo inicial",
            "include_in_balance": "Considerar no saldo",
            "is_active": "Conta ativa",
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form_fields(self)
