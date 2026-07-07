from decimal import Decimal

import pytest
from django.db import IntegrityError

from accounts.models import Account


@pytest.mark.django_db
def test_account_creation(baker):
    """Conta deve ser criada com os campos corretos."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    account = baker.make(
        "accounts.Account",
        user=user,
        tenant=tenant,
        name="Conta Corrente",
        account_type=Account.AccountType.BANK,
    )

    assert account.id is not None
    assert str(account) == "Conta Corrente"


@pytest.mark.django_db
def test_account_unique_name_per_tenant(baker):
    """Nome da conta deve ser unico por tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    baker.make("accounts.Account", user=user, tenant=tenant, name="Carteira")

    with pytest.raises(IntegrityError):
        baker.make("accounts.Account", user=user, tenant=tenant, name="Carteira")


@pytest.mark.django_db
def test_account_save_auto_assigns_tenant_when_missing(baker):
    """Ao salvar sem tenant explicito, deve usar o tenant padrao do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)

    account = Account(user=user, name="Poupanca")
    account.save()

    assert account.tenant_id == tenant.id


@pytest.mark.django_db
def test_account_balance_equals_initial_balance_without_transactions(baker):
    """Sem transacoes lancadas, o saldo deve ser igual ao saldo inicial."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    account = baker.make(
        "accounts.Account",
        user=user,
        tenant=tenant,
        account_type=Account.AccountType.BANK,
        initial_balance=Decimal("250.00"),
        include_in_balance=True,
    )

    assert account.balance == Decimal("250.00")


@pytest.mark.django_db
def test_account_balance_is_zero_when_excluded_and_not_card(baker):
    """Contas excluidas do saldo (e que nao sao cartao) devem retornar zero."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    account = baker.make(
        "accounts.Account",
        user=user,
        tenant=tenant,
        account_type=Account.AccountType.BANK,
        initial_balance=Decimal("500.00"),
        include_in_balance=False,
    )

    assert account.balance == Decimal("0.00")


@pytest.mark.django_db
def test_card_monthly_limit_unique_per_account_month_year(baker):
    """Limite mensal do cartao deve ser unico por conta/mes/ano."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    account = baker.make("accounts.Account", user=user, tenant=tenant, account_type=Account.AccountType.CARD)

    baker.make(
        "accounts.CardMonthlyLimit",
        tenant=tenant,
        account=account,
        year=2026,
        month=7,
        amount=Decimal("1000.00"),
    )

    with pytest.raises(IntegrityError):
        baker.make(
            "accounts.CardMonthlyLimit",
            tenant=tenant,
            account=account,
            year=2026,
            month=7,
            amount=Decimal("2000.00"),
        )


@pytest.mark.django_db
def test_card_monthly_limit_str(baker):
    """__str__ deve combinar nome da conta e mes/ano."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    account = baker.make(
        "accounts.Account",
        user=user,
        tenant=tenant,
        name="Cartao Nubank",
        account_type=Account.AccountType.CARD,
    )

    limit = baker.make(
        "accounts.CardMonthlyLimit",
        tenant=tenant,
        account=account,
        year=2026,
        month=8,
        amount=Decimal("1500.00"),
    )

    assert str(limit) == "Cartao Nubank — 08/2026"
