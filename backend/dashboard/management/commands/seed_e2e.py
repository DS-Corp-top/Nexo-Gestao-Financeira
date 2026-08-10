import os
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.text import slugify

from accounts.models import Account
from categories.models import Category
from tenants.models import Tenant, TenantMembership
from transactions.models import Transaction

User = get_user_model()

DEFAULT_EMAIL = "e2e@example.com"
DEFAULT_USERNAME = "e2e-user"
DEFAULT_PASSWORD = "E2ePlaywright!123"
DEFAULT_TENANT_NAME = "E2E Tenant"
DEFAULT_ACCOUNT_NAME = "Conta E2E"
DEFAULT_CARD_NAME = "Cartao E2E"
DEFAULT_CARD_CATEGORY = "Cartao Dashboard E2E"
DEFAULT_CARD_PURCHASE_DESCRIPTION = "Compra Dashboard E2E"


class Command(BaseCommand):
    """Seeds a deterministic user/tenant/account for Playwright E2E runs.

    Idempotent: safe to run on every CI job without duplicating data. Refuses
    to run against a real Heroku dyno so this never touches production data.
    """

    help = "Seed a test user, tenant and account for the Playwright E2E suite."

    def handle(self, *args, **options):
        if os.getenv("DYNO"):
            raise CommandError("seed_e2e não pode rodar em um dyno Heroku (produção).")

        email = os.getenv("E2E_USER_EMAIL", DEFAULT_EMAIL)
        password = os.getenv("E2E_USER_PASSWORD", DEFAULT_PASSWORD)

        user, created = User.objects.get_or_create(
            email=email,
            defaults={"username": DEFAULT_USERNAME, "is_active": True},
        )
        user.set_password(password)
        user.is_active = True
        user.save()

        tenant, _ = Tenant.objects.get_or_create(
            owner=user,
            defaults={
                "name": DEFAULT_TENANT_NAME,
                "slug": slugify(DEFAULT_TENANT_NAME) + f"-{user.pk}",
                "document": "00000000000",
                "is_active": True,
            },
        )

        TenantMembership.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={"role": TenantMembership.Role.OWNER, "is_default": True},
        )

        Account.objects.update_or_create(
            tenant=tenant,
            name=DEFAULT_ACCOUNT_NAME,
            defaults={
                "user": user,
                "account_type": Account.AccountType.BANK,
                "is_active": True,
            },
        )

        card_account, _ = Account.objects.update_or_create(
            tenant=tenant,
            name=DEFAULT_CARD_NAME,
            defaults={
                "user": user,
                "account_type": Account.AccountType.CARD,
                "credit_limit": Decimal("1000.00"),
                "include_in_balance": False,
                "is_active": False,
            },
        )

        category, _ = Category.objects.get_or_create(
            tenant=tenant,
            user=user,
            name=DEFAULT_CARD_CATEGORY,
            category_type=Category.CategoryType.EXPENSE,
            defaults={"expense_kind": Category.ExpenseKind.OPERATING},
        )

        Transaction.objects.update_or_create(
            tenant=tenant,
            user=user,
            account=card_account,
            category=category,
            description=DEFAULT_CARD_PURCHASE_DESCRIPTION,
            date=timezone.localdate().replace(day=1),
            defaults={
                "transaction_type": Transaction.TransactionType.EXPENSE,
                "amount": Decimal("250.00"),
                "is_cleared": True,
                "is_ignored": False,
            },
        )

        self.stdout.write(self.style.SUCCESS(
            f"Seed E2E OK — user={email} tenant={tenant.name} (id={tenant.pk})"
        ))
