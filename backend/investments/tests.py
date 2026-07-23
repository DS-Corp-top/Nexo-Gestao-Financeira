from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from investments.models import Investment, InvestmentEntry
from tenants.models import Tenant, TenantMembership


class InvestmentApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="investment-api-user",
            password="secret123",
        )
        self.other_user = user_model.objects.create_user(
            username="investment-api-other",
            password="secret123",
        )
        self.tenant = Tenant.objects.create(
            name="Investment Tenant",
            slug="investment-tenant",
            owner=self.user,
            document="12345678901",
        )
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role=TenantMembership.Role.OWNER,
            is_default=True,
        )
        self.other_tenant = Tenant.objects.create(
            name="Other Investment Tenant",
            slug="other-investment-tenant",
            owner=self.other_user,
            document="12345678902",
        )
        TenantMembership.objects.create(
            tenant=self.other_tenant,
            user=self.other_user,
            role=TenantMembership.Role.OWNER,
            is_default=True,
        )
        self.investment = Investment.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Tesouro API",
            investment_type=Investment.InvestmentType.FIXED_INCOME,
            broker="Banco API",
        )
        self.other_investment = Investment.objects.create(
            user=self.other_user,
            tenant=self.other_tenant,
            name="Outro Investimento API",
            investment_type=Investment.InvestmentType.STOCKS,
        )
        self.client = APIClient()
        self.client.defaults["HTTP_X_REQUESTED_WITH"] = "XMLHttpRequest"
        self.client.force_authenticate(self.user)

    def test_investment_api_create_assigns_user_and_tenant(self):
        response = self.client.post(
            "/api/v1/investments/",
            {
                "name": "Reserva API",
                "investment_type": Investment.InvestmentType.EMERGENCY,
                "currency": Investment.Currency.USD,
                "broker": "Banco Reserva",
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        investment = Investment.objects.get(name="Reserva API")
        self.assertEqual(investment.user, self.user)
        self.assertEqual(investment.tenant, self.tenant)
        self.assertEqual(investment.currency, Investment.Currency.USD)

    def test_investment_api_list_is_limited_to_current_tenant(self):
        response = self.client.get("/api/v1/investments/")

        self.assertEqual(response.status_code, 200)
        ids = {item["id"] for item in response.data["results"]}
        self.assertEqual(ids, {self.investment.pk})

    def test_investment_api_exposes_total_balance_on_list_and_detail(self):
        InvestmentEntry.objects.create(
            user=self.user,
            tenant=self.tenant,
            investment=self.investment,
            entry_type=InvestmentEntry.EntryType.DEPOSIT,
            amount=Decimal("1000.00"),
            date="2026-07-01",
        )
        InvestmentEntry.objects.create(
            user=self.user,
            tenant=self.tenant,
            investment=self.investment,
            entry_type=InvestmentEntry.EntryType.YIELD,
            amount=Decimal("14.53"),
            date="2026-07-02",
        )
        InvestmentEntry.objects.create(
            user=self.user,
            tenant=self.tenant,
            investment=self.investment,
            entry_type=InvestmentEntry.EntryType.TAX,
            amount=Decimal("2.53"),
            date="2026-07-03",
        )

        list_response = self.client.get("/api/v1/investments/")
        detail_response = self.client.get(f"/api/v1/investments/{self.investment.pk}/")

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(
            list_response.data["results"][0]["total_balance"],
            "1012.00",
        )
        self.assertEqual(detail_response.data["total_balance"], "1012.00")
        self.assertEqual(detail_response.data["net_invested"], "1000.00")
        self.assertEqual(detail_response.data["total_earnings"], "14.53")
        self.assertEqual(detail_response.data["total_taxes"], "2.53")

    def test_investment_add_entry_api_creates_tenant_scoped_entry(self):
        response = self.client.post(
            f"/api/v1/investments/{self.investment.pk}/add_entry/",
            {
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "350.00",
                "date": "2026-06-20",
                "description": "Aporte API",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        entry = InvestmentEntry.objects.get(description="Aporte API")
        self.assertEqual(entry.user, self.user)
        self.assertEqual(entry.tenant, self.tenant)
        self.assertEqual(entry.investment, self.investment)
        self.assertEqual(entry.amount, Decimal("350.00"))

    def test_investment_entry_api_rejects_other_tenant_investment(self):
        response = self.client.post(
            "/api/v1/investment-entries/",
            {
                "investment": self.other_investment.pk,
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "350.00",
                "date": "2026-06-20",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(
            InvestmentEntry.objects.filter(
                investment=self.other_investment,
                tenant=self.tenant,
            ).exists()
        )

    def test_investment_entry_api_rejects_non_positive_amount(self):
        response = self.client.post(
            f"/api/v1/investments/{self.investment.pk}/add_entry/",
            {
                "entry_type": InvestmentEntry.EntryType.DEPOSIT,
                "amount": "0.00",
                "date": "2026-06-20",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)

    @patch("investments.api_views.fetch_brl_exchange_rates")
    def test_exchange_rates_endpoint_returns_brl_rates(self, fetch_rates):
        fetch_rates.return_value = {
            "base": "BRL",
            "rates": {
                "BRL": Decimal("1"),
                "USD": Decimal("5.4321"),
                "EUR": Decimal("6.1234"),
            },
            "updated_at": "2026-06-29 10:30:00",
            "source": "AwesomeAPI",
        }

        response = self.client.get("/api/v1/investments/exchange-rates/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["base"], "BRL")
        self.assertEqual(response.data["rates"]["USD"], "5.4321")
        self.assertEqual(response.data["rates"]["EUR"], "6.1234")

    @patch("investments.api_views.fetch_bacen_banks")
    def test_bacen_banks_endpoint_returns_bank_suggestions(self, fetch_banks):
        fetch_banks.return_value = [
            {
                "cnpj": "28195667",
                "name": "BANCO ABC BRASIL S.A.",
                "segment": "Banco Multiplo",
            }
        ]

        response = self.client.get("/api/v1/investments/bacen-banks/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["results"][0]["name"], "BANCO ABC BRASIL S.A.")
