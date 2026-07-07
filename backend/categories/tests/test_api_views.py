import pytest
from rest_framework.test import APIClient
from django.urls import reverse

from categories.models import Category


@pytest.mark.django_db
def test_list_categories_returns_only_tenant_data(baker):
    """Listagem retorna apenas categorias do tenant do usuario."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_user = baker.make("auth.User")
    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    baker.make("tenants.TenantMembership", user=other_user, tenant=other_tenant)

    baker.make("categories.Category", user=user, tenant=tenant, name="Categoria Minha")
    baker.make("categories.Category", user=other_user, tenant=other_tenant, name="Categoria Alheia")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:category-list")
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    names = [r["name"] for r in response.data["results"]]
    assert "Categoria Minha" in names
    assert "Categoria Alheia" not in names


@pytest.mark.django_db
def test_create_category_assigns_user_and_tenant(baker):
    """Criacao de categoria deve atribuir automaticamente user e tenant do request."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:category-list")
    response = client.post(
        url,
        {"name": "Lazer", "category_type": Category.CategoryType.EXPENSE},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    category = Category.objects.get(name="Lazer")
    assert category.user == user
    assert category.tenant == tenant


@pytest.mark.django_db
def test_delete_category(baker):
    """Exclusao de categoria deve retornar 204."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)
    category = baker.make("categories.Category", user=user, tenant=tenant, name="Para Deletar")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:category-detail", args=[category.id])
    response = client.delete(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 204


@pytest.mark.django_db
def test_category_unauthenticated_returns_401(baker):
    """Sem autenticacao, a API retorna 401."""
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    url = reverse("api:category-list")
    response = client.get(url)
    assert response.status_code == 401


@pytest.mark.django_db
def test_category_from_another_tenant_is_not_reachable(baker):
    """IDOR: categoria de outro tenant nao deve ser acessivel via detail."""
    user = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=user, tenant=tenant)

    other_tenant = baker.make("tenants.Tenant", document="11111111111", is_active=True)
    other_user = baker.make("auth.User")
    other_category = baker.make(
        "categories.Category", user=other_user, tenant=other_tenant, name="Categoria Alheia"
    )

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)

    url = reverse("api:category-detail", args=[other_category.id])
    response = client.get(url, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 404
