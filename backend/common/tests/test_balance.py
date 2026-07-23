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


def test_backing_investment_replaces_fixed_limit(baker):
    """Aplicar num CDB vinculado vira limite do cartao, no lugar do limite fixo."""
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(),
    )
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("5000.00"),  # deve ser ignorado: CDB tem precedencia
        backing_investment=cdb,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("1000.00")


def test_backing_investment_withdrawal_reduces_limit_immediately(baker):
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(1),
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.WITHDRAWAL,
        amount=Decimal("400.00"), date=this_month_date(2),
    )
    baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=None,
        backing_investment=cdb,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("600.00")


def test_backing_investment_withdrawal_never_goes_negative(baker):
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(1),
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.WITHDRAWAL,
        amount=Decimal("1500.00"), date=this_month_date(2),
    )
    baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=None,
        backing_investment=cdb,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("0.00")


def test_investment_deposit_is_not_counted_as_income(baker):
    """Aportes no CDB nunca criam Transaction — nao podem virar receita."""
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(),
    )

    assert Transaction.objects.filter(tenant=tenant).count() == 0


def test_monthly_override_takes_precedence_over_backing_investment(baker):
    """Um limite mensal explicito ainda vence o valor vindo do CDB de garantia."""
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(),
    )
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        backing_investment=cdb,
    )
    today = timezone.localdate()
    baker.make(
        "accounts.CardMonthlyLimit",
        tenant=tenant, account=card, year=today.year, month=today.month,
        amount=Decimal("300.00"),
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("300.00")


def test_backing_investment_ignored_for_past_month_without_override(baker):
    """Cada mes e isolado: sem limite mensal explicito, o CDB de garantia nao
    se aplica a meses passados, igual ja acontece com o limite fixo."""
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(),
    )
    baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        backing_investment=cdb,
    )
    past_month = timezone.localdate().replace(year=2000, month=1, day=1)

    available = calculate_credit_card_available_limit(tenant, past_month)

    assert available == Decimal("0.00")


def test_backing_investment_earnings_do_not_count_toward_the_limit(baker):
    """Rendimentos/dividendos do CDB nao entram no limite do cartao garantido."""
    from investments.models import Investment, InvestmentEntry

    user, tenant = setup_tenant(baker)
    cdb = Investment.objects.create(
        tenant=tenant, user=user, name="CDB Garantia",
        investment_type=Investment.InvestmentType.FIXED_INCOME,
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.DEPOSIT,
        amount=Decimal("1000.00"), date=this_month_date(1),
    )
    InvestmentEntry.objects.create(
        tenant=tenant, user=user, investment=cdb,
        entry_type=InvestmentEntry.EntryType.YIELD,
        amount=Decimal("14.53"), date=this_month_date(2),
    )
    baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        backing_investment=cdb,
    )

    available = calculate_credit_card_available_limit(tenant, this_month_start())

    assert available == Decimal("1000.00")
    assert cdb.total_balance == Decimal("1014.53")
    assert cdb.net_invested == Decimal("1000.00")
