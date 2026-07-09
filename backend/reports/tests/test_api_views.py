from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from investments.models import InvestmentEntry


def _client(user):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    return client


def _tenant_user(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    return user, tenant


@pytest.mark.django_db
def test_transactions_report_requires_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    response = client.get(reverse("api:report_transactions"), {"date_start": "2026-01-01", "date_end": "2026-01-31"})
    assert response.status_code == 401


@pytest.mark.django_db
def test_transactions_report_requires_date_params(baker):
    user, tenant = _tenant_user(baker)
    client = _client(user)

    response = client.get(reverse("api:report_transactions"), HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 400
    assert "date_start" in response.data


@pytest.mark.django_db
def test_transactions_report_rejects_inverted_range(baker):
    user, tenant = _tenant_user(baker)
    client = _client(user)

    response = client.get(
        reverse("api:report_transactions"),
        {"date_start": "2026-02-01", "date_end": "2026-01-01"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_transactions_report_balances_and_totals(baker):
    user, tenant = _tenant_user(baker)
    account = baker.make("accounts.Account", tenant=tenant, user=user, initial_balance=1000)

    # Before the report range — must be reflected in opening_balance only.
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="income", amount=500, date=date(2026, 1, 15), is_cleared=True,
    )
    # Within range.
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="income", amount=300, date=date(2026, 2, 10), is_cleared=True, description="Salario",
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="expense", amount=120, date=date(2026, 2, 20), is_cleared=True, description="Aluguel",
    )
    # After the range — must not affect anything.
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="expense", amount=999, date=date(2026, 3, 5), is_cleared=True,
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_transactions"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.data
    assert data["opening_balance"] == "1500.00"
    assert data["closing_balance"] == "1680.00"
    assert data["total_income"] == "300.00"
    assert data["total_expense"] == "120.00"
    assert len(data["transactions"]) == 2
    assert {t["description"] for t in data["transactions"]} == {"Salario", "Aluguel"}


@pytest.mark.django_db
def test_transactions_report_account_filter_scopes_to_account(baker):
    user, tenant = _tenant_user(baker)
    account_a = baker.make("accounts.Account", tenant=tenant, user=user, initial_balance=100)
    account_b = baker.make("accounts.Account", tenant=tenant, user=user, initial_balance=5000)
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account_a, user=user,
        transaction_type="income", amount=50, date=date(2026, 2, 10), is_cleared=True,
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account_b, user=user,
        transaction_type="income", amount=5000, date=date(2026, 2, 10), is_cleared=True,
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_transactions"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28", "account": account_a.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.data["opening_balance"] == "100.00"
    assert response.data["closing_balance"] == "150.00"
    assert response.data["total_income"] == "50.00"


@pytest.mark.django_db
def test_transactions_report_rejects_account_from_other_tenant(baker):
    user, tenant = _tenant_user(baker)
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    foreign_account = baker.make("accounts.Account", tenant=other_tenant)

    client = _client(user)
    response = client.get(
        reverse("api:report_transactions"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28", "account": foreign_account.id},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


@pytest.mark.django_db
def test_summary_report_groups_income_and_expense_by_category(baker):
    user, tenant = _tenant_user(baker)
    account = baker.make("accounts.Account", tenant=tenant, user=user)
    salary = baker.make("categories.Category", tenant=tenant, category_type="income", name="Salario")
    rent = baker.make("categories.Category", tenant=tenant, category_type="expense", name="Aluguel")

    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=salary,
        transaction_type="income", amount=3000, date=date(2026, 2, 5),
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=rent,
        transaction_type="expense", amount=1200, date=date(2026, 2, 10),
    )
    # Ignored transactions must be excluded from the summary.
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=rent,
        transaction_type="expense", amount=99999, date=date(2026, 2, 15), is_ignored=True,
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_summary"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.data
    assert data["total_income"] == "3000.00"
    assert data["total_expense"] == "1200.00"
    assert data["balance"] == "1800.00"
    assert data["income_by_category"] == [{"name": "Salario", "total": "3000.00"}]
    assert data["expense_by_category"] == [{"name": "Aluguel", "total": "1200.00"}]


@pytest.mark.django_db
def test_investments_report_only_counts_entries_in_period(baker):
    user, tenant = _tenant_user(baker)
    investment = baker.make("investments.Investment", tenant=tenant, user=user, name="Tesouro Selic")

    baker.make(
        "investments.InvestmentEntry", tenant=tenant, user=user, investment=investment,
        entry_type=InvestmentEntry.EntryType.DEPOSIT, amount=1000, date=date(2026, 2, 5),
    )
    baker.make(
        "investments.InvestmentEntry", tenant=tenant, user=user, investment=investment,
        entry_type=InvestmentEntry.EntryType.YIELD, amount=15, date=date(2026, 2, 20),
    )
    # Outside the requested period — must not count.
    baker.make(
        "investments.InvestmentEntry", tenant=tenant, user=user, investment=investment,
        entry_type=InvestmentEntry.EntryType.DEPOSIT, amount=9999, date=date(2026, 3, 1),
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_investments"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.data
    assert data["total_invested"] == "1000.00"
    assert data["total_earnings"] == "15.00"
    assert len(data["investments"]) == 1
    assert data["investments"][0]["name"] == "Tesouro Selic"


@pytest.mark.django_db
def test_investments_report_omits_investments_without_movement_in_period(baker):
    user, tenant = _tenant_user(baker)
    baker.make("investments.Investment", tenant=tenant, user=user, name="Sem movimentacao")

    client = _client(user)
    response = client.get(
        reverse("api:report_investments"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.data["investments"] == []


@pytest.mark.django_db
def test_dre_requires_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    response = client.get(reverse("api:report_dre"), {"date_start": "2026-02-01", "date_end": "2026-02-28"})
    assert response.status_code == 401


@pytest.mark.django_db
def test_dre_available_to_regular_tenant_member(baker):
    """DRE Gerencial e baseado em Transacoes — nao depende do modulo de
    Fatura de Servico, entao qualquer membro do tenant acessa (sem
    exigir superusuario)."""
    user, tenant = _tenant_user(baker)
    client = _client(user)

    response = client.get(
        reverse("api:report_dre"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200


@pytest.mark.django_db
def test_dre_computes_gross_profit_and_net_result(baker):
    user, tenant = _tenant_user(baker)
    account = baker.make("accounts.Account", tenant=tenant, user=user)
    salary = baker.make("categories.Category", tenant=tenant, category_type="income", name="Servicos")
    supplies = baker.make(
        "categories.Category", tenant=tenant, category_type="expense", name="Materiais",
        expense_kind="cost",
    )
    rent = baker.make(
        "categories.Category", tenant=tenant, category_type="expense", name="Aluguel",
        expense_kind="operating",
    )

    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=salary,
        transaction_type="income", amount=Decimal("5000.00"), date=date(2026, 2, 5),
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=supplies,
        transaction_type="expense", amount=Decimal("1200.00"), date=date(2026, 2, 10),
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=rent,
        transaction_type="expense", amount=Decimal("800.00"), date=date(2026, 2, 15),
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_dre"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.data
    assert data["total_income"] == "5000.00"
    assert data["costs_by_category"] == [{"name": "Materiais", "total": "1200.00"}]
    assert data["total_cost"] == "1200.00"
    assert data["gross_profit"] == "3800.00"
    assert data["operating_expenses"] == [{"name": "Aluguel", "total": "800.00"}]
    assert data["total_operating_expenses"] == "800.00"
    assert data["net_result"] == "3000.00"


@pytest.mark.django_db
def test_dre_treats_default_expense_kind_as_operating(baker):
    """Categoria sem expense_kind explicito (default) entra como Despesa
    Operacional, nao como Custo — o default do model garante isso."""
    user, tenant = _tenant_user(baker)
    account = baker.make("accounts.Account", tenant=tenant, user=user)
    misc = baker.make("categories.Category", tenant=tenant, category_type="expense", name="Diversos")

    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user, category=misc,
        transaction_type="expense", amount=Decimal("300.00"), date=date(2026, 2, 10),
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_dre"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    data = response.data
    assert data["total_cost"] == "0.00"
    assert data["total_operating_expenses"] == "300.00"


@pytest.mark.django_db
def test_dre_excludes_transactions_outside_period(baker):
    user, tenant = _tenant_user(baker)
    account = baker.make("accounts.Account", tenant=tenant, user=user)

    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="income", amount=Decimal("1000.00"), date=date(2026, 1, 31),
    )
    baker.make(
        "transactions.Transaction", tenant=tenant, account=account, user=user,
        transaction_type="income", amount=Decimal("2000.00"), date=date(2026, 3, 1),
    )

    client = _client(user)
    response = client.get(
        reverse("api:report_dre"),
        {"date_start": "2026-02-01", "date_end": "2026-02-28"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    assert response.data["total_income"] == "0.00"
