from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from transactions.models import Transaction


pytestmark = pytest.mark.django_db


def setup_tenant(baker):
    user = baker.make("auth.User", is_active=True)
    tenant = baker.make("tenants.Tenant", is_active=True, document="00000000000")
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)
    return user, tenant


def test_dashboard_returns_credit_card_debt_percentage(baker):
    user, tenant = setup_tenant(baker)
    card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
        include_in_balance=False,
    )
    Transaction.objects.create(
        tenant=tenant,
        user=user,
        account=card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("250.00"),
        date=timezone.localdate(),
        is_cleared=True,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    response = client.get(reverse("api:dashboard"))

    assert response.status_code == 200
    assert response.data["alerts"]["credit_card_limit"] == "750.00"
    assert response.data["alerts"]["credit_card_total_limit"] == "1000.00"
    assert response.data["alerts"]["credit_card_used_limit"] == "250.00"
    assert response.data["alerts"]["debt_percentage"] == "25.00"


def test_dashboard_sums_multiple_cards_in_debt_percentage(baker):
    user, tenant = setup_tenant(baker)
    first_card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("1000.00"),
        include_in_balance=False,
    )
    second_card = baker.make(
        "accounts.Account",
        tenant=tenant,
        user=user,
        account_type=Account.AccountType.CARD,
        credit_limit=Decimal("500.00"),
        include_in_balance=False,
    )
    Transaction.objects.create(
        tenant=tenant,
        user=user,
        account=first_card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("250.00"),
        date=timezone.localdate(),
        is_cleared=True,
    )
    Transaction.objects.create(
        tenant=tenant,
        user=user,
        account=second_card,
        transaction_type=Transaction.TransactionType.EXPENSE,
        amount=Decimal("100.00"),
        date=timezone.localdate(),
        is_cleared=True,
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    response = client.get(reverse("api:dashboard"))

    assert response.status_code == 200
    assert response.data["alerts"]["credit_card_limit"] == "1150.00"
    assert response.data["alerts"]["credit_card_total_limit"] == "1500.00"
    assert response.data["alerts"]["credit_card_used_limit"] == "350.00"
    assert response.data["alerts"]["debt_percentage"] == "23.33"


def test_dashboard_masks_credit_card_debt_percentage_for_foreign_superuser(baker):
    _, tenant = setup_tenant(baker)
    superuser = baker.make("auth.User", is_superuser=True, is_active=True)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=superuser)
    response = client.get(reverse("api:dashboard"), HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["masked"] is True
    assert response.data["alerts"]["credit_card_total_limit"] is None
    assert response.data["alerts"]["credit_card_used_limit"] is None
    assert response.data["alerts"]["debt_percentage"] is None
