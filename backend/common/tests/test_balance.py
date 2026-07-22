from decimal import Decimal

import pytest
from django.utils import timezone

from accounts.models import Account
from common.balance import calculate_credit_card_available_limit
from transactions.models import Transaction

pytestmark = pytest.mark.django_db


def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


def this_month_date(day=15):
    return timezone.localdate().replace(day=day)


def this_month_start():
    return timezone.localdate().replace(day=1)


def test_fixed_limit_minus_cleared_expenses(baker):
    user, tenant = setup_tenant(baker)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("300.00"), date=this_month_date(), is_cleared=True,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("700.00")


def test_fixed_limit_ignores_uncleared_expenses(baker):
    user, tenant = setup_tenant(baker)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("300.00"), date=this_month_date(), is_cleared=False,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("1000.00")


def test_incoming_transfer_restores_available_limit(baker):
    """Pagar a fatura via transferencia deve devolver o limite gasto."""
    user, tenant = setup_tenant(baker)
    checking = baker.make("accounts.Account", tenant=tenant, user=user, account_type=Account.AccountType.BANK)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("300.00"), date=this_month_date(), is_cleared=True,
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=checking, destination_account=card,
        transaction_type=Transaction.TransactionType.TRANSFER,
        amount=Decimal("300.00"), date=this_month_date(), is_cleared=True,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("1000.00")


def test_uncleared_incoming_transfer_does_not_count(baker):
    user, tenant = setup_tenant(baker)
    checking = baker.make("accounts.Account", tenant=tenant, user=user, account_type=Account.AccountType.BANK)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=checking, destination_account=card,
        transaction_type=Transaction.TransactionType.TRANSFER,
        amount=Decimal("300.00"), date=this_month_date(), is_cleared=False,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("1000.00")


def test_past_month_without_override_is_ignored(baker):
    """Cada mes e isolado: sem CardMonthlyLimit explicito, meses passados nao usam o limite fixo do cartao."""
    user, tenant = setup_tenant(baker)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    past_month = timezone.localdate().replace(year=2000, month=1, day=1)

    available = calculate_credit_card_available_limit(tenant, past_month)

    assert available == Decimal("0.00")


def test_past_month_with_explicit_override_is_used(baker):
    user, tenant = setup_tenant(baker)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
    )
    past_month = timezone.localdate().replace(year=2000, month=1, day=1)
    baker.make(
        "accounts.CardMonthlyLimit",
        tenant=tenant, account=card, year=2000, month=1, amount=Decimal("400.00"),
    )

    available = calculate_credit_card_available_limit(tenant, past_month)

    assert available == Decimal("400.00")


def test_no_fixed_limit_current_month_uses_incoming_transfer(baker):
    """Sem limite fixo, uma transferencia recebida no mes atual ja da limite disponivel."""
    user, tenant = setup_tenant(baker)
    checking = baker.make("accounts.Account", tenant=tenant, user=user, account_type=Account.AccountType.BANK)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=None,
        initial_balance=Decimal("0.00"),
    )
    Transaction.objects.create(
        tenant=tenant, user=user, account=checking, destination_account=card,
        transaction_type=Transaction.TransactionType.TRANSFER,
        amount=Decimal("500.00"), date=this_month_date(), is_cleared=True,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("500.00")


def test_no_fixed_limit_and_no_money_in_skips_card(baker):
    user, tenant = setup_tenant(baker)
    baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=None,
        initial_balance=Decimal("0.00"),
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("0.00")
