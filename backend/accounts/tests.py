from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from accounts.models import Account
from categories.models import Category
from transactions.models import Transaction


class AccountBalanceTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.user = user_model.objects.create_user(
            username="account-balance-user",
            password="secret123",
        )
        self.client.force_login(self.user)
        self.bank_account = Account.objects.create(
            user=self.user,
            name="Banco",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("1000.00"),
        )
        self.card_account = Account.objects.create(
            user=self.user,
            name="Cartao de Credito",
            account_type=Account.AccountType.BANK,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        self.expense_category = Category.objects.create(
            user=self.user,
            name="Cartao",
            category_type=Category.CategoryType.EXPENSE,
        )

    def test_card_transactions_do_not_change_account_balances(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("600.00"),
            date=date(2026, 3, 10),
            account=self.card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(self.bank_account.balance, Decimal("1000.00"))
        self.assertEqual(self.card_account.balance, Decimal("0.00"))

    def test_card_account_balance_updates_with_cleared_status(self):
        real_card_account = Account.objects.create(
            user=self.user,
            name="Cartao real",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        card_expense = Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 10),
            account=real_card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(real_card_account.balance, Decimal("-81.68"))

        card_expense.is_cleared = False
        card_expense.save(update_fields=["is_cleared"])

        self.assertEqual(real_card_account.balance, Decimal("0.00"))

    def test_account_list_shows_card_account_balance(self):
        real_card_account = Account.objects.create(
            user=self.user,
            name="Cartao real",
            account_type=Account.AccountType.CARD,
            initial_balance=Decimal("0.00"),
            include_in_balance=False,
        )
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.EXPENSE,
            amount=Decimal("81.68"),
            date=date(2026, 3, 10),
            account=real_card_account,
            category=self.expense_category,
            description="Compra no cartao",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        response = self.client.get(reverse("accounts:list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Cartao real")
        self.assertContains(response, "Saldo: -R$ 81,68")

    def test_transfer_to_card_reduces_only_source_account_balance(self):
        Transaction.objects.create(
            user=self.user,
            transaction_type=Transaction.TransactionType.TRANSFER,
            amount=Decimal("400.00"),
            date=date(2026, 3, 15),
            account=self.bank_account,
            destination_account=self.card_account,
            description="Pagamento da fatura",
            recurrence_type=Transaction.RecurrenceType.ONCE,
            is_cleared=True,
        )

        self.assertEqual(self.bank_account.balance, Decimal("600.00"))
        self.assertEqual(self.card_account.balance, Decimal("0.00"))

    def test_account_form_exposes_include_in_balance_option(self):
        response = self.client.get(reverse("accounts:update", args=[self.bank_account.pk]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Considerar no saldo")

    def test_create_account_assigns_logged_in_user(self):
        response = self.client.post(
            reverse("accounts:create"),
            {
                "name": "Reserva",
                "account_type": Account.AccountType.CASH,
                "initial_balance": "250.00",
                "include_in_balance": "on",
                "is_active": "on",
            },
        )

        self.assertRedirects(response, reverse("accounts:list"))
        account = Account.objects.get(name="Reserva")
        self.assertEqual(account.user, self.user)
        self.assertIsNotNone(account.tenant)
