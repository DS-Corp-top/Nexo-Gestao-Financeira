import pytest
from django.db import IntegrityError

from categories.models import Category


@pytest.mark.django_db
def test_category_creation(baker):
    """Categoria deve ser criada com os campos corretos."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    category = baker.make(
        "categories.Category",
        user=user,
        tenant=tenant,
        name="Mercado",
        category_type=Category.CategoryType.EXPENSE,
    )

    assert category.id is not None
    assert category.name == "Mercado"
    assert str(category) == "Mercado (Despesa)"


@pytest.mark.django_db
def test_category_unique_name_type_per_tenant(baker):
    """Nome + tipo devem ser unicos por tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    baker.make(
        "categories.Category",
        user=user,
        tenant=tenant,
        name="Salario",
        category_type=Category.CategoryType.INCOME,
    )

    with pytest.raises(IntegrityError):
        baker.make(
            "categories.Category",
            user=user,
            tenant=tenant,
            name="Salario",
            category_type=Category.CategoryType.INCOME,
        )


@pytest.mark.django_db
def test_category_same_name_allowed_for_different_type(baker):
    """Mesmo nome pode existir para tipos diferentes (receita x despesa) no mesmo tenant."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    baker.make(
        "categories.Category",
        user=user,
        tenant=tenant,
        name="Outros",
        category_type=Category.CategoryType.INCOME,
    )
    expense = baker.make(
        "categories.Category",
        user=user,
        tenant=tenant,
        name="Outros",
        category_type=Category.CategoryType.EXPENSE,
    )

    assert expense.id is not None


@pytest.mark.django_db
def test_category_save_auto_assigns_tenant_when_missing(baker):
    """Ao salvar sem tenant explicito, deve usar o tenant padrao do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant, is_default=True)

    category = Category(
        user=user,
        name="Transporte",
        category_type=Category.CategoryType.EXPENSE,
    )
    category.save()

    assert category.tenant_id == tenant.id
