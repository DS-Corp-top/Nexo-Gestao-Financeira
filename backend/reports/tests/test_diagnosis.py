from datetime import date
from decimal import Decimal

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from reports.diagnosis import baseline_phrase, baseline_phrase_of, brl, pct, ratio


def _client(user):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    return client


def _tenant_user(baker):
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    return user, tenant


def _txn(baker, user, tenant, account, kind, amount, when, category=None, **extra):
    return baker.make(
        "transactions.Transaction", tenant=tenant, user=user, account=account, category=category,
        transaction_type=kind, amount=amount, date=when, is_cleared=extra.pop("is_cleared", True), **extra,
    )


@pytest.fixture
def scenario(baker):
    """Três meses "normais" (jan–mar) e um abril pesado por causa de Viagem e Moradia."""
    user, tenant = _tenant_user(baker)
    bank = baker.make("accounts.Account", tenant=tenant, user=user, account_type="bank")
    card = baker.make("accounts.Account", tenant=tenant, user=user, account_type="card")
    salary = baker.make("categories.Category", tenant=tenant, category_type="income", name="Salário")
    rent = baker.make("categories.Category", tenant=tenant, category_type="expense", name="Moradia")
    food = baker.make("categories.Category", tenant=tenant, category_type="expense", name="Alimentação")
    travel = baker.make("categories.Category", tenant=tenant, category_type="expense", name="Viagem")

    for month in (1, 2, 3):
        _txn(baker, user, tenant, bank, "income", 5000, date(2026, month, 5), salary)
        _txn(baker, user, tenant, bank, "expense", 1500, date(2026, month, 10), rent, recurrence_type="fixed")
        _txn(baker, user, tenant, card, "expense", 1000, date(2026, month, 15), food)

    _txn(baker, user, tenant, bank, "income", 5000, date(2026, 4, 5), salary)
    _txn(baker, user, tenant, bank, "expense", 2000, date(2026, 4, 10), rent, recurrence_type="fixed")
    _txn(baker, user, tenant, card, "expense", 400, date(2026, 4, 15), food)
    _txn(baker, user, tenant, card, "expense", 3000, date(2026, 4, 20), travel, description="Passagens")
    return {"user": user, "tenant": tenant, "bank": bank, "card": card, "salary": salary}


def test_brl_formats_brazilian_currency():
    assert brl(Decimal("1234.5")) == "R$ 1.234,50"
    assert brl(Decimal("-0.456")) == "-R$ 0,46"
    assert brl(Decimal("1000000")) == "R$ 1.000.000,00"


@pytest.mark.django_db
def test_oscillations_requires_auth():
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    assert client.get(reverse("api:report_oscillations")).status_code == 401
    assert client.get(reverse("api:report_month_diagnosis")).status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize(
    "params",
    [{"end_month": "2026-13"}, {"end_month": "abc"}, {"months": "2"}, {"months": "x"}, {"status": "foo"}],
)
def test_oscillations_rejects_invalid_params(baker, params):
    user, tenant = _tenant_user(baker)
    response = _client(user).get(reverse("api:report_oscillations"), params, HTTP_X_TENANT_ID=str(tenant.id))
    assert response.status_code == 400


@pytest.mark.django_db
def test_oscillations_series_and_flags(scenario):
    response = _client(scenario["user"]).get(
        reverse("api:report_oscillations"),
        {"end_month": "2026-05", "months": 6},
        HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code == 200
    months = {m["month"]: m for m in response.data["months"]}
    assert list(months) == ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]

    assert months["2026-01"]["income"] == "5000.00"
    assert months["2026-01"]["expense"] == "2500.00"
    assert months["2026-01"]["net"] == "2500.00"
    assert months["2026-04"]["expense"] == "5400.00"
    assert months["2026-04"]["net"] == "-400.00"
    assert months["2026-04"]["flag"] == "deficit"
    assert months["2025-12"]["flag"] == "empty"
    assert months["2026-05"]["flag"] == "empty"
    # Média só considera meses com movimentação: (2500*3 + 5400) / 4.
    assert response.data["average_expense"] == "3225.00"


@pytest.mark.django_db
def test_oscillations_excludes_transfers_ignored_and_card_income(scenario, baker):
    user, tenant, bank, card = scenario["user"], scenario["tenant"], scenario["bank"], scenario["card"]
    other = baker.make("accounts.Account", tenant=tenant, user=user, account_type="bank")
    _txn(baker, user, tenant, bank, "transfer", 999, date(2026, 1, 20), destination_account=other)
    _txn(baker, user, tenant, bank, "expense", 777, date(2026, 1, 21), is_ignored=True, is_cleared=False)
    _txn(baker, user, tenant, card, "income", 555, date(2026, 1, 22))

    response = _client(user).get(
        reverse("api:report_oscillations"), {"end_month": "2026-03", "months": 3},
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    january = response.data["months"][0]
    assert january["income"] == "5000.00"
    assert january["expense"] == "2500.00"


@pytest.mark.django_db
def test_oscillations_status_filter(scenario, baker):
    user, tenant, bank = scenario["user"], scenario["tenant"], scenario["bank"]
    _txn(baker, user, tenant, bank, "expense", 300, date(2026, 3, 25), is_cleared=False)

    def march_expense(status):
        response = _client(user).get(
            reverse("api:report_oscillations"), {"end_month": "2026-03", "months": 3, "status": status},
            HTTP_X_TENANT_ID=str(tenant.id),
        )
        return response.data["months"][-1]["expense"]

    assert march_expense("all") == "2800.00"
    assert march_expense("cleared") == "2500.00"
    assert march_expense("pending") == "300.00"


@pytest.mark.django_db
def test_oscillations_tenant_isolation(scenario, baker):
    intruder, intruder_tenant = _tenant_user(baker)
    response = _client(intruder).get(
        reverse("api:report_oscillations"), {"end_month": "2026-04", "months": 4},
        HTTP_X_TENANT_ID=str(intruder_tenant.id),
    )
    assert all(m["flag"] == "empty" for m in response.data["months"])

    # Pedir o tenant de outro usuário pelo header não pode funcionar.
    response = _client(intruder).get(
        reverse("api:report_oscillations"), {"end_month": "2026-04"},
        HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code in (403, 404)


@pytest.mark.django_db
def test_oscillations_masked_for_view_only_superuser(scenario, baker):
    admin = baker.make("auth.User", is_superuser=True, is_staff=True)
    response = _client(admin).get(
        reverse("api:report_oscillations"), {"end_month": "2026-04"},
        HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code == 200
    assert response.data["masked"] is True
    assert response.data["months"] == []


@pytest.mark.django_db
def test_diagnosis_explains_heavy_month(scenario):
    response = _client(scenario["user"]).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-04", "baseline_months": 3},
        HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code == 200
    data = response.data

    assert data["income"] == "5000.00"
    assert data["expense"] == "5400.00"
    assert data["net"] == "-400.00"
    assert data["baseline"]["months"] == 3
    assert data["baseline"]["expense"] == "2500.00"
    assert data["verdict"]["level"] == "critical"

    increases = {d["name"]: d for d in data["expense_increases"]}
    assert list(increases) == ["Viagem", "Moradia"]
    assert increases["Viagem"]["is_new"] is True
    assert increases["Moradia"]["delta"] == "500.00"
    assert [d["name"] for d in data["expense_decreases"]] == ["Alimentação"]
    assert data["expense_decreases"][0]["delta"] == "-600.00"

    composition = {c["kind"]: c for c in data["composition"]}
    assert composition["recurring"]["value"] == "2000.00"
    assert composition["one_off"]["value"] == "3400.00"
    assert data["card_expense"] == "3400.00"

    assert data["top_expenses"][0]["description"] == "Passagens"
    texts = " ".join(i["text"] for i in data["insights"])
    assert "“Viagem” é um gasto novo" in texts
    assert "“Moradia” pesou R$ 500,00 a mais" in texts
    assert "“Alimentação” ficou R$ 600,00 abaixo da média" in texts
    assert "gasto pontual concentrou 56%" in texts


@pytest.mark.django_db
def test_diagnosis_explains_surplus_month(scenario, baker):
    user, tenant, bank = scenario["user"], scenario["tenant"], scenario["bank"]
    bonus = baker.make("categories.Category", tenant=tenant, category_type="income", name="Bônus")
    _txn(baker, user, tenant, bank, "income", 3000, date(2026, 5, 6), bonus)
    _txn(baker, user, tenant, bank, "income", 5000, date(2026, 5, 5), scenario["salary"])
    _txn(baker, user, tenant, bank, "expense", 1500, date(2026, 5, 10))

    response = _client(user).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-05", "baseline_months": 3},
        HTTP_X_TENANT_ID=str(tenant.id),
    )
    data = response.data
    assert data["net"] == "6500.00"
    assert data["verdict"]["level"] == "excellent"
    assert any(c["name"] == "Bônus" and c["is_new"] for c in data["income_changes"])
    assert any("Entrada extra em “Bônus”" in i["text"] for i in data["insights"])


@pytest.mark.django_db
def test_diagnosis_without_history(baker):
    user, tenant = _tenant_user(baker)
    bank = baker.make("accounts.Account", tenant=tenant, user=user, account_type="bank")
    _txn(baker, user, tenant, bank, "income", 1000, date(2026, 4, 1))
    _txn(baker, user, tenant, bank, "expense", 960, date(2026, 4, 2))

    data = _client(user).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-04"}, HTTP_X_TENANT_ID=str(tenant.id),
    ).data
    assert data["baseline"]["months"] == 0
    assert data["expense_increases"] == []
    assert data["verdict"]["level"] == "attention"  # sobrou só 4%
    assert data["verdict"]["title"] == "Margem apertada"
    assert "Ainda não há meses anteriores" in data["insights"][0]["text"]


@pytest.mark.django_db
def test_diagnosis_empty_month(baker):
    user, tenant = _tenant_user(baker)
    data = _client(user).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-04"}, HTTP_X_TENANT_ID=str(tenant.id),
    ).data
    assert data["verdict"]["level"] == "empty"
    assert data["insights"] == []
    assert data["savings_rate"] is None


@pytest.mark.django_db
def test_diagnosis_flags_installments_and_pending(scenario, baker):
    user, tenant, card = scenario["user"], scenario["tenant"], scenario["card"]
    _txn(
        baker, user, tenant, card, "expense", 1200, date(2026, 6, 3), is_cleared=False,
        recurrence_type="installment", installment_count=10, installment_number=1, description="Notebook",
    )
    data = _client(user).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-06"}, HTTP_X_TENANT_ID=str(tenant.id),
    ).data
    composition = {c["kind"]: c for c in data["composition"]}
    assert composition["installment"]["value"] == "1200.00"
    assert data["pending_expense"] == "1200.00"
    assert data["top_expenses"][0]["description"] == "Notebook (1/10)"
    texts = " ".join(i["text"] for i in data["insights"])
    assert "Parcelamentos comprometem 100%" in texts
    assert "R$ 1.200,00 em despesas não baixadas" in texts


@pytest.mark.django_db
def test_diagnosis_masked_for_view_only_superuser(scenario, baker):
    admin = baker.make("auth.User", is_superuser=True, is_staff=True)
    response = _client(admin).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-04"},
        HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code == 200
    assert response.data == {"month": "2026-04", "status": "all", "masked": True}


# ---------------------------------------------------------------------------
# Helpers puros
# ---------------------------------------------------------------------------


def test_pct_ratio_and_baseline_phrases():
    assert pct(Decimal("0.155")) == "16%"
    assert pct(Decimal("-0.5")) == "50%"
    assert ratio(Decimal("1"), Decimal("4")) == Decimal("0.25")
    assert ratio(Decimal("1"), Decimal("0")) is None
    assert baseline_phrase(3) == "a média dos últimos 3 meses"
    assert baseline_phrase(1) == "o mês anterior com movimentação"
    assert baseline_phrase_of(3) == "da média dos últimos 3 meses"
    assert baseline_phrase_of(1) == "do mês anterior com movimentação"


# ---------------------------------------------------------------------------
# Série mensal
# ---------------------------------------------------------------------------


def _bank_user(baker):
    user, tenant = _tenant_user(baker)
    bank = baker.make("accounts.Account", tenant=tenant, user=user, account_type="bank")
    return user, tenant, bank


def _category(baker, tenant, kind, name):
    return baker.make("categories.Category", tenant=tenant, category_type=kind, name=name)


def _get(user, tenant, name, params):
    return _client(user).get(reverse(f"api:{name}"), params, HTTP_X_TENANT_ID=str(tenant.id))


def _history(baker, user, tenant, bank, months, income, expense):
    for month in months:
        _txn(baker, user, tenant, bank, "income", income, date(2026, month, 1))
        _txn(baker, user, tenant, bank, "expense", expense, date(2026, month, 2))


@pytest.mark.django_db
def test_oscillations_flags_heavy_surplus_and_normal(baker):
    user, tenant, bank = _bank_user(baker)
    for month, income, expense in ((1, 5000, 2000), (2, 5000, 2000), (3, 5000, 3000), (4, 8000, 1000)):
        _history(baker, user, tenant, bank, (month,), income, expense)

    data = _get(user, tenant, "report_oscillations", {"end_month": "2026-04", "months": 4}).data
    flags = {m["month"]: m["flag"] for m in data["months"]}
    # médias: receita 5750, despesa 2000, sobra 3750
    assert flags == {"2026-01": "normal", "2026-02": "normal", "2026-03": "heavy", "2026-04": "surplus"}
    assert data["months"][2]["expense_vs_average"] == 0.5
    assert data["average_income"] == "5750.00"
    assert data["average_net"] == "3750.00"


@pytest.mark.django_db
def test_oscillations_defaults_to_last_12_months_until_current_month(baker, monkeypatch):
    user, tenant, _ = _bank_user(baker)
    monkeypatch.setattr("reports.api_views.timezone.localdate", lambda: date(2026, 4, 15))

    data = _get(user, tenant, "report_oscillations", {}).data
    assert data["end_month"] == "2026-04"
    assert data["status"] == "all"
    assert len(data["months"]) == 12
    assert data["months"][0]["month"] == "2025-05"
    assert data["months"][-1]["month"] == "2026-04"


@pytest.mark.django_db
@pytest.mark.parametrize("months, expected", [("3", 200), ("36", 200), ("37", 400), ("", 200)])
def test_oscillations_months_bounds(baker, months, expected):
    user, tenant, _ = _bank_user(baker)
    response = _get(user, tenant, "report_oscillations", {"end_month": "2026-04", "months": months})
    assert response.status_code == expected


# ---------------------------------------------------------------------------
# Vereditos
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_verdict_expenses_above_normal_but_positive(baker):
    user, tenant, bank = _bank_user(baker)
    _history(baker, user, tenant, bank, (1, 2, 3), 5000, 2000)
    _history(baker, user, tenant, bank, (4,), 5000, 3000)

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04", "baseline_months": 3}).data
    assert data["verdict"] == {
        "level": "attention",
        "title": "Despesas acima do normal",
        "summary": "Você gastou 50% a mais que a média dos últimos 3 meses, mas ainda fechou positivo em R$ 2.000,00.",
    }
    texts = [i["text"] for i in data["insights"]]
    assert "Despesas 50% acima da média dos últimos 3 meses (R$ 3.000,00 contra R$ 2.000,00)." in texts


@pytest.mark.django_db
def test_verdict_balanced_month(baker):
    user, tenant, bank = _bank_user(baker)
    _history(baker, user, tenant, bank, (1, 2, 3), 5000, 4000)
    _history(baker, user, tenant, bank, (4,), 5000, 4100)

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04"}).data
    assert data["verdict"] == {
        "level": "good",
        "title": "Mês equilibrado",
        "summary": "Saldo positivo de R$ 900,00 (18% da receita), dentro do seu padrão.",
    }
    # Variação de 2,5% nas despesas não vira comentário.
    assert not any(i["text"].startswith("Despesas") for i in data["insights"])


@pytest.mark.django_db
def test_verdict_healthy_surplus_without_history(baker):
    user, tenant, bank = _bank_user(baker)
    _history(baker, user, tenant, bank, (4,), 1000, 500)

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04"}).data
    assert data["verdict"] == {
        "level": "excellent",
        "title": "Sobra acima do normal",
        "summary": "Sobraram R$ 500,00 (50% da receita).",
    }
    assert data["savings_rate"] == 0.5


@pytest.mark.django_db
def test_verdict_surplus_mentions_average(scenario, baker):
    user, tenant, bank = scenario["user"], scenario["tenant"], scenario["bank"]
    _history(baker, user, tenant, bank, (5,), 9000, 2000)

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-05", "baseline_months": 3}).data
    assert data["verdict"]["level"] == "excellent"
    # Fev–abr: sobras de 2500, 2500 e -400.
    assert data["verdict"]["summary"] == (
        "Sobraram R$ 7.000,00 (78% da receita), contra uma sobra média de R$ 1.533,33."
    )


# ---------------------------------------------------------------------------
# Frases explicativas
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_insights_income_drops_and_category_without_spending(baker):
    user, tenant, bank = _bank_user(baker)
    salary = _category(baker, tenant, "income", "Salário")
    freela = _category(baker, tenant, "income", "Freela")
    rent_in = _category(baker, tenant, "income", "Aluguel")
    leisure = _category(baker, tenant, "expense", "Lazer")
    market = _category(baker, tenant, "expense", "Mercado")

    _txn(baker, user, tenant, bank, "income", 5000, date(2026, 3, 1), salary)
    _txn(baker, user, tenant, bank, "income", 1000, date(2026, 3, 2), freela)
    _txn(baker, user, tenant, bank, "income", 800, date(2026, 3, 3), rent_in)
    _txn(baker, user, tenant, bank, "expense", 500, date(2026, 3, 4), leisure)
    _txn(baker, user, tenant, bank, "expense", 1000, date(2026, 3, 5), market, recurrence_type="monthly")

    _txn(baker, user, tenant, bank, "income", 5000, date(2026, 4, 1), salary)
    _txn(baker, user, tenant, bank, "income", 300, date(2026, 4, 3), rent_in)
    _txn(baker, user, tenant, bank, "expense", 1000, date(2026, 4, 5), market, recurrence_type="monthly")

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04"}).data
    assert data["baseline"]["months"] == 1
    assert [d["name"] for d in data["income_changes"]] == ["Freela", "Aluguel"]
    assert [d["name"] for d in data["expense_decreases"]] == ["Lazer"]

    assert data["insights"] == [
        {"tone": "positive", "text": "Despesas 33% abaixo do mês anterior com movimentação (R$ 1.000,00 contra R$ 1.500,00)."},
        {"tone": "negative", "text": "Receitas 22% abaixo do mês anterior com movimentação (R$ 5.300,00 contra R$ 6.800,00)."},
        {"tone": "positive", "text": "Sem gastos com “Lazer” neste mês (média de R$ 500,00)."},
        {"tone": "negative", "text": "Não entrou nada em “Freela” neste mês (média de R$ 1.000,00)."},
        {"tone": "negative", "text": "“Aluguel” rendeu R$ 500,00 a menos que o normal."},
    ]


@pytest.mark.django_db
def test_insights_income_rise_and_heavy_recurring_costs(baker):
    user, tenant, bank = _bank_user(baker)
    salary = _category(baker, tenant, "income", "Salário")
    rent = _category(baker, tenant, "expense", "Moradia")
    # Histórico só com receita: média de despesa zero não gera "% acima".
    _txn(baker, user, tenant, bank, "income", 5000, date(2026, 3, 1), salary)
    _txn(baker, user, tenant, bank, "income", 6000, date(2026, 4, 1), salary)
    _txn(baker, user, tenant, bank, "expense", 4500, date(2026, 4, 2), rent, recurrence_type="fixed")

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04"}).data
    texts = [i["text"] for i in data["insights"]]
    assert not any(t.startswith("Despesas") for t in texts)
    assert "Receitas 20% acima do mês anterior com movimentação (R$ 6.000,00 contra R$ 5.000,00)." in texts
    assert "“Salário” rendeu R$ 1.000,00 a mais que o normal." in texts
    assert "“Moradia” é um gasto novo: R$ 4.500,00 sem registro nos meses anteriores." in texts
    assert "Gastos fixos e recorrentes já consomem 75% da receita — pouca margem para variações." in texts
    assert data["verdict"]["level"] == "good"


@pytest.mark.django_db
def test_diagnosis_respects_baseline_window_and_driver_floor(baker):
    user, tenant, bank = _bank_user(baker)
    market = _category(baker, tenant, "expense", "Mercado")
    travel = _category(baker, tenant, "expense", "Viagem")

    # Fora da janela de 2 meses: não pode entrar na média.
    _txn(baker, user, tenant, bank, "expense", 10000, date(2026, 1, 10), travel)
    for month in (2, 3):
        _txn(baker, user, tenant, bank, "income", 3000, date(2026, month, 1))
        _txn(baker, user, tenant, bank, "expense", 1000, date(2026, month, 5), market)

    _txn(baker, user, tenant, bank, "income", 3000, date(2026, 4, 1))
    _txn(baker, user, tenant, bank, "expense", 1010, date(2026, 4, 5), market, description="Compras")
    for day in range(10, 16):
        _txn(baker, user, tenant, bank, "expense", 100, date(2026, 4, day), description=f"Avulso {day}")

    data = _get(user, tenant, "report_month_diagnosis", {"month": "2026-04", "baseline_months": 2}).data
    assert data["baseline"] == {
        "months": 2, "requested_months": 2, "income": "3000.00", "expense": "1000.00", "net": "2000.00",
    }
    # Mercado subiu só R$ 10 — abaixo do piso (3% de R$ 1.610), não é citado.
    assert [d["name"] for d in data["expense_increases"]] == ["Sem categoria"]
    assert data["expense_increases"][0]["delta"] == "600.00"
    # Viagem só teve gasto fora da janela, então não "aliviou" nada.
    assert data["expense_decreases"] == []
    assert len(data["top_expenses"]) == 5
    assert data["top_expenses"][0]["description"] == "Compras"
    composition = {c["kind"]: c for c in data["composition"]}
    assert composition["one_off"]["count"] == 7


@pytest.mark.django_db
def test_diagnosis_status_filter(scenario, baker):
    user, tenant, bank = scenario["user"], scenario["tenant"], scenario["bank"]
    _txn(baker, user, tenant, bank, "expense", 250, date(2026, 4, 28), is_cleared=False)

    def expense(status):
        return _get(user, tenant, "report_month_diagnosis", {"month": "2026-04", "status": status}).data["expense"]

    assert expense("all") == "5650.00"
    assert expense("cleared") == "5400.00"
    assert expense("pending") == "250.00"


@pytest.mark.django_db
@pytest.mark.parametrize(
    "params",
    [
        {"month": "2026-13"},
        {"month": "abril"},
        {"baseline_months": "0"},
        {"baseline_months": "25"},
        {"baseline_months": "x"},
        {"status": "foo"},
    ],
)
def test_diagnosis_rejects_invalid_params(baker, params):
    user, tenant, _ = _bank_user(baker)
    assert _get(user, tenant, "report_month_diagnosis", params).status_code == 400


@pytest.mark.django_db
def test_diagnosis_defaults_to_current_month(baker, monkeypatch):
    user, tenant, bank = _bank_user(baker)
    monkeypatch.setattr("reports.api_views.timezone.localdate", lambda: date(2026, 4, 15))
    _history(baker, user, tenant, bank, (4,), 1000, 400)

    data = _get(user, tenant, "report_month_diagnosis", {}).data
    assert data["month"] == "2026-04"
    assert data["baseline"]["requested_months"] == 6
    assert data["expense"] == "400.00"


@pytest.mark.django_db
def test_diagnosis_tenant_isolation(scenario, baker):
    intruder, intruder_tenant = _tenant_user(baker)
    data = _get(intruder, intruder_tenant, "report_month_diagnosis", {"month": "2026-04"}).data
    assert data["expense"] == "0.00"
    assert data["top_expenses"] == []
    assert data["verdict"]["level"] == "empty"

    response = _client(intruder).get(
        reverse("api:report_month_diagnosis"), {"month": "2026-04"}, HTTP_X_TENANT_ID=str(scenario["tenant"].id),
    )
    assert response.status_code in (403, 404)
