from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from categories.models import Category
from tenants.models import Tenant, TenantMembership
from transactions.models import Transaction

User = get_user_model()


class TransactionApiViewSetTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="txnuser", password="123")
        self.tenant = Tenant.objects.create(
            name="Tenant Transacoes",
            slug="tenant-transacoes",
            owner=self.user,
            document="12345678901",
        )
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role=TenantMembership.Role.OWNER,
            is_default=True,
        )
        self.client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        self.client.force_authenticate(self.user)
        self.account = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Conta Original",
            account_type=Account.AccountType.BANK,
        )
        self.new_account = Account.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Conta Atualizada",
            account_type=Account.AccountType.BANK,
        )
        self.category = Category.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Categoria Original",
            category_type=Category.CategoryType.EXPENSE,
        )
        self.new_category = Category.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Categoria Atualizada",
            category_type=Category.CategoryType.EXPENSE,
        )

    def test_delete_cleared_transaction_is_blocked(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="150.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Academia",
            is_cleared=True,
        )

        response = self.client.delete(f"/api/v1/transactions/{transaction.pk}/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("já foi baixada", response.data["detail"])
        self.assertTrue(Transaction.objects.filter(pk=transaction.pk).exists())

    def test_delete_pending_transaction_succeeds(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="150.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Academia",
            is_cleared=False,
        )

        response = self.client.delete(f"/api/v1/transactions/{transaction.pk}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Transaction.objects.filter(pk=transaction.pk).exists())

    def test_update_scope_all_updates_future_pending_occurrences(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="150.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Academia",
            is_cleared=False,
            recurrence_type=Transaction.RecurrenceType.FIXED,
            recurrence_interval=1,
            recurrence_interval_unit=Transaction.IntervalUnit.MONTH,
        )
        transaction.generate_future_occurrences()

        response = self.client.patch(
            f"/api/v1/transactions/{transaction.pk}/",
            data={
                "transaction_type": Transaction.TransactionType.EXPENSE,
                "amount": "150.00",
                "description": "Academia Premium",
                "date": "2026-07-15",
                "account": self.new_account.pk,
                "destination_account": None,
                "category": self.new_category.pk,
                "is_cleared": False,
                "is_ignored": False,
                "recurrence_type": Transaction.RecurrenceType.FIXED,
                "recurrence_interval": 1,
                "recurrence_interval_unit": Transaction.IntervalUnit.MONTH,
                "installment_count": None,
                "scope": "all",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)

        transaction.refresh_from_db()
        self.assertEqual(transaction.description, "Academia Premium")
        self.assertEqual(transaction.date, date(2026, 7, 15))
        self.assertEqual(transaction.account_id, self.new_account.id)
        self.assertEqual(transaction.category_id, self.new_category.id)

        occurrences = list(
            Transaction.objects.filter(
                tenant=self.tenant,
                description="Academia Premium",
                recurrence_type=Transaction.RecurrenceType.FIXED,
            )
            .order_by("date", "pk")[:3]
        )

        self.assertEqual(len(occurrences), 3)
        self.assertEqual([occ.date for occ in occurrences], [
            date(2026, 7, 15),
            date(2026, 8, 15),
            date(2026, 9, 15),
        ])
        self.assertTrue(all(occ.account_id == self.new_account.id for occ in occurrences))
        self.assertTrue(all(occ.category_id == self.new_category.id for occ in occurrences))
        self.assertTrue(all(occ.description == "Academia Premium" for occ in occurrences))
        self.assertTrue(all(occ.is_ignored is False for occ in occurrences[1:]))

    def test_toggle_cleared_allows_changing_category(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="100.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Mercado",
            is_cleared=False,
        )

        response = self.client.post(
            f"/api/v1/transactions/{transaction.pk}/toggle_cleared/",
            data={
                "cleared_date": "2026-07-11",
                "category": self.new_category.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        transaction.refresh_from_db()
        self.assertTrue(transaction.is_cleared)
        self.assertEqual(transaction.category_id, self.new_category.id)

    def test_toggle_cleared_allows_clearing_category(self):
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="100.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Mercado",
            is_cleared=False,
        )

        response = self.client.post(
            f"/api/v1/transactions/{transaction.pk}/toggle_cleared/",
            data={
                "cleared_date": "2026-07-11",
                "category": None,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        transaction.refresh_from_db()
        self.assertIsNone(transaction.category_id)

    def test_toggle_cleared_rejects_category_from_other_tenant(self):
        other_user = User.objects.create_user(username="othertxnuser", password="123")
        other_tenant = Tenant.objects.create(
            name="Outro Tenant",
            slug="outro-tenant-transacoes",
            owner=other_user,
            document="98765432100",
        )
        other_category = Category.objects.create(
            user=other_user,
            tenant=other_tenant,
            name="Categoria Alheia",
            category_type=Category.CategoryType.EXPENSE,
        )
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="100.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Mercado",
            is_cleared=False,
        )

        response = self.client.post(
            f"/api/v1/transactions/{transaction.pk}/toggle_cleared/",
            data={
                "cleared_date": "2026-07-11",
                "category": other_category.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        transaction.refresh_from_db()
        self.assertEqual(transaction.category_id, self.category.id)

    def test_toggle_cleared_rejects_category_with_mismatched_type(self):
        income_category = Category.objects.create(
            user=self.user,
            tenant=self.tenant,
            name="Categoria Receita",
            category_type=Category.CategoryType.INCOME,
        )
        transaction = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="100.00",
            date=date(2026, 7, 10),
            account=self.account,
            category=self.category,
            description="Mercado",
            is_cleared=False,
        )

        response = self.client.post(
            f"/api/v1/transactions/{transaction.pk}/toggle_cleared/",
            data={
                "cleared_date": "2026-07-11",
                "category": income_category.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        transaction.refresh_from_db()
        self.assertEqual(transaction.category_id, self.category.id)

    def test_toggle_cleared_rejects_category_on_transfer(self):
        transfer = Transaction.objects.create(
            user=self.user,
            tenant=self.tenant,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount="100.00",
            date=date(2026, 7, 10),
            account=self.account,
            destination_account=self.new_account,
            description="Transferencia",
            is_cleared=False,
        )

        response = self.client.post(
            f"/api/v1/transactions/{transfer.pk}/toggle_cleared/",
            data={
                "cleared_date": "2026-07-11",
                "category": self.category.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        transfer.refresh_from_db()
        self.assertIsNone(transfer.category_id)


class StatementSummaryTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="summaryuser", password="123")
        self.tenant = Tenant.objects.create(
            name="Tenant Resumo",
            slug="tenant-resumo",
            owner=self.user,
            document="12345678901",
        )
        TenantMembership.objects.create(
            tenant=self.tenant,
            user=self.user,
            role=TenantMembership.Role.OWNER,
            is_default=True,
        )
        self.client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
        self.client.force_authenticate(self.user)
        self.bank_account = Account.objects.create(
            user=self.user, tenant=self.tenant, name="Conta Corrente",
            account_type=Account.AccountType.BANK,
        )
        self.card_account = Account.objects.create(
            user=self.user, tenant=self.tenant, name="Cartao",
            account_type=Account.AccountType.CARD, include_in_balance=False,
        )

    def test_statement_summary_pending_income_excludes_card_but_totals_include_it(self):
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.bank_account,
            transaction_type=Transaction.TransactionType.INCOME,
            amount="2000.00", date=date(2026, 7, 5), is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.bank_account,
            transaction_type=Transaction.TransactionType.INCOME,
            amount="500.00", date=date(2026, 7, 6), is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.card_account,
            transaction_type=Transaction.TransactionType.INCOME,
            amount="80.00", date=date(2026, 7, 7), is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.bank_account,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="300.00", date=date(2026, 7, 8), is_cleared=True,
        )
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.bank_account,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="100.00", date=date(2026, 7, 9), is_cleared=False,
        )
        Transaction.objects.create(
            user=self.user, tenant=self.tenant, account=self.card_account,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount="150.00", date=date(2026, 7, 10), is_cleared=False,
        )

        response = self.client.get(
            "/api/v1/transactions/statement_summary/", data={"month": "2026-07"}
        )

        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(data["pending_income_total"], "500.00")
        self.assertEqual(data["pending_bank_total"], "100.00")
        self.assertEqual(data["credit_card_open_total"], "150.00")
        self.assertEqual(data["monthly_income_total"], "2580.00")
        self.assertEqual(data["monthly_expense_total"], "550.00")
