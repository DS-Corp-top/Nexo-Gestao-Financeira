import pytest
from django.core.management import call_command

from accounts.models import Account
from categories.models import Category
from tenants.models import Tenant, TenantMembership
from transactions.models import Transaction
from django.contrib.auth import get_user_model

User = get_user_model()


@pytest.mark.django_db
def test_seed_e2e_creates_user_tenant_and_account():
    call_command("seed_e2e")

    user = User.objects.get(email="e2e@example.com")
    assert user.is_active
    assert user.check_password("E2ePlaywright!123")

    tenant = Tenant.objects.get(owner=user)
    assert TenantMembership.objects.filter(
        user=user, tenant=tenant, role=TenantMembership.Role.OWNER, is_default=True
    ).exists()
    assert Account.objects.filter(tenant=tenant, name="Conta E2E").exists()
    assert Account.objects.filter(
        tenant=tenant,
        name="Cartao E2E",
        credit_limit="1000.00",
        is_active=False,
    ).exists()
    assert Category.objects.filter(tenant=tenant, name="Cartao Dashboard E2E", category_type="expense").exists()
    assert Transaction.objects.filter(
        tenant=tenant,
        description="Compra Dashboard E2E",
        amount="250.00",
        transaction_type="expense",
        is_cleared=True,
    ).exists()


@pytest.mark.django_db
def test_seed_e2e_is_idempotent():
    call_command("seed_e2e")
    call_command("seed_e2e")

    assert User.objects.filter(email="e2e@example.com").count() == 1
    user = User.objects.get(email="e2e@example.com")
    assert Tenant.objects.filter(owner=user).count() == 1
    assert Account.objects.filter(name="Conta E2E").count() == 1
    assert Account.objects.filter(name="Cartao E2E").count() == 1
    assert Category.objects.filter(name="Cartao Dashboard E2E", category_type="expense").count() == 1
    assert Transaction.objects.filter(description="Compra Dashboard E2E").count() == 1


@pytest.mark.django_db
def test_seed_e2e_refuses_to_run_on_heroku_dyno(monkeypatch):
    from django.core.management.base import CommandError

    monkeypatch.setenv("DYNO", "web.1")
    with pytest.raises(CommandError):
        call_command("seed_e2e")
