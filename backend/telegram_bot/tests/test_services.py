from decimal import Decimal

import pytest

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
