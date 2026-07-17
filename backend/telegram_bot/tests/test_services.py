from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from telegram_bot.services import parse_transaction_message

pytestmark = pytest.mark.django_db


def test_parse_extracts_amount_with_comma_decimal(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")

    parsed = parse_transaction_message("Mercado 89,90", tenant=tenant)

    assert parsed["amount"] == Decimal("89.90")
    assert parsed["transaction_type"] == "expense"


def test_parse_extracts_amount_with_thousands_separator(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000001")

    parsed = parse_transaction_message("Aluguel 1.234,56", tenant=tenant)

    assert parsed["amount"] == Decimal("1234.56")


def test_parse_detects_income_keyword(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000002")

    parsed = parse_transaction_message("Recebi 500 do cliente", tenant=tenant)

    assert parsed["transaction_type"] == "income"


def test_parse_defaults_to_expense(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000003")

    parsed = parse_transaction_message("Combustível 200", tenant=tenant)

    assert parsed["transaction_type"] == "expense"


def test_parse_returns_none_without_amount(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000004")

    parsed = parse_transaction_message("oi tudo bem", tenant=tenant)

    assert parsed is None


def test_parse_matches_existing_category_case_and_accent_insensitive(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000005")
    category = baker.make(
        "categories.Category",
        tenant=tenant,
        name="Alimentação",
        category_type="expense",
    )

    parsed = parse_transaction_message("alimentacao 45", tenant=tenant)

    assert parsed["category"] == category


def test_parse_leaves_category_none_when_no_match(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000006")
    baker.make("categories.Category", tenant=tenant, name="Transporte", category_type="expense")

    parsed = parse_transaction_message("Combustível 200", tenant=tenant)

    assert parsed["category"] is None


def test_parse_matches_account_named_in_message(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000007")
    baker.make("accounts.Account", tenant=tenant, name="Carteira", is_active=True)
    nubank = baker.make("accounts.Account", tenant=tenant, name="Nubank", is_active=True)

    parsed = parse_transaction_message("Mercado 89,90 Nubank", tenant=tenant)

    assert parsed["account"] == nubank


def test_parse_leaves_account_none_when_not_named(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000008")
    baker.make("accounts.Account", tenant=tenant, name="Nubank", is_active=True)

    parsed = parse_transaction_message("Mercado 89,90", tenant=tenant)

    assert parsed["account"] is None


def test_parse_prefers_longer_account_name_match(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000009")
    baker.make("accounts.Account", tenant=tenant, name="Nu", is_active=True)
    card = baker.make("accounts.Account", tenant=tenant, name="Nubank Cartão", is_active=True)

    parsed = parse_transaction_message("Mercado 89,90 Nubank Cartão", tenant=tenant)

    assert parsed["account"] == card


def test_parse_defaults_date_to_today(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000010")

    parsed = parse_transaction_message("Mercado 89,90", tenant=tenant)

    assert parsed["date"] == timezone.localdate()


def test_parse_recognizes_ontem(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000011")

    parsed = parse_transaction_message("Mercado 89,90 ontem", tenant=tenant)

    assert parsed["date"] == timezone.localdate() - timedelta(days=1)


def test_parse_recognizes_anteontem_and_not_just_ontem(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000012")

    parsed = parse_transaction_message("Mercado 89,90 anteontem", tenant=tenant)

    assert parsed["date"] == timezone.localdate() - timedelta(days=2)


def test_parse_recognizes_amanha_with_accent(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000013")

    parsed = parse_transaction_message("Mercado 89,90 amanhã", tenant=tenant)

    assert parsed["date"] == timezone.localdate() + timedelta(days=1)


def test_parse_recognizes_explicit_date_without_year(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000014")
    today = timezone.localdate()

    parsed = parse_transaction_message("Mercado 89,90 15/07", tenant=tenant)

    assert parsed["date"].day == 15
    assert parsed["date"].month == 7
    assert parsed["date"].year == today.year


def test_parse_recognizes_explicit_date_with_year(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000015")

    parsed = parse_transaction_message("Mercado 89,90 15/07/2025", tenant=tenant)

    assert parsed["date"].isoformat() == "2025-07-15"


def test_parse_explicit_date_does_not_get_read_as_amount(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000016")

    parsed = parse_transaction_message("Mercado 15/07 89,90", tenant=tenant)

    assert parsed["amount"] == Decimal("89.90")
    assert parsed["date"].day == 15
    assert parsed["date"].month == 7


def test_parse_ignores_invalid_explicit_date(baker):
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000017")

    parsed = parse_transaction_message("Mercado 89,90 45/13", tenant=tenant)

    assert parsed["date"] == timezone.localdate()
