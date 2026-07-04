import pytest
from django.urls import reverse
from rest_framework.test import APIClient

pytestmark = pytest.mark.django_db


def test_cannot_create_membership_for_arbitrary_existing_user(baker):
    """Mass assignment: um admin do tenant nao pode anexar um usuario existente
    qualquer (e vazar seu e-mail/nome) sem passar pelo fluxo de convite."""
    admin = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make(
        "tenants.TenantMembership",
        user=admin,
        tenant=tenant,
        role="owner",
        is_default=True,
    )

    victim = baker.make("auth.User", email="victim@example.com")

    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=admin)

    url = reverse("api:tenant-membership-list")
    response = client.post(
        url,
        {"user": victim.id, "role": "owner"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 405
    from tenants.models import TenantMembership
    assert not TenantMembership.objects.filter(user=victim).exists()


def _make_admin(baker, role="owner"):
    admin = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
    baker.make("tenants.TenantMembership", user=admin, tenant=tenant, role=role, is_default=True)
    return admin, tenant


def _authed_client(user):
    client = APIClient(HTTP_X_REQUESTED_WITH="XMLHttpRequest")
    client.force_authenticate(user=user)
    return client


# --- TenantProfileView ---------------------------------------------------

def test_get_tenant_profile_returns_own_tenant(baker):
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.get(reverse("api:tenant_profile"), HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 200
    assert response.data["id"] == tenant.id


def test_update_tenant_profile_changes_name(baker):
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.patch(
        reverse("api:tenant_profile"),
        {"name": "Novo Nome"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    tenant.refresh_from_db()
    assert tenant.name == "Novo Nome"


# --- TenantInviteUserView -------------------------------------------------

def test_invite_user_creates_membership(baker):
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant_invite_user"),
        {"name": "Novo Membro", "email": "novo@example.com", "password": "senha123", "role": "member"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201
    assert response.data["user_email"] == "novo@example.com"
    from django.contrib.auth import get_user_model
    from tenants.models import TenantMembership
    user = get_user_model().objects.get(email="novo@example.com")
    assert TenantMembership.objects.filter(user=user, tenant=tenant, role="member").exists()


def test_invite_user_requires_tenant_admin(baker):
    member, tenant = _make_admin(baker, role="member")
    client = _authed_client(member)

    response = client.post(
        reverse("api:tenant_invite_user"),
        {"name": "X", "email": "x@example.com", "password": "senha123", "role": "member"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 403


@pytest.mark.parametrize(
    "payload,expected_detail_fragment",
    [
        ({"name": "", "email": "x@example.com", "password": "senha123"}, "obrigat"),
        ({"name": "X", "email": "x@example.com", "password": "123"}, "6 caracteres"),
        ({"name": "X", "email": "x@example.com", "password": "senha123", "role": "superadmin"}, "invalido"),
    ],
)
def test_invite_user_rejects_invalid_payloads(baker, payload, expected_detail_fragment):
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant_invite_user"), payload, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 400


def test_invite_user_rejects_duplicate_email(baker):
    admin, tenant = _make_admin(baker)
    baker.make("auth.User", email="ja-existe@example.com")
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant_invite_user"),
        {"name": "X", "email": "ja-existe@example.com", "password": "senha123", "role": "member"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


def test_invite_user_enforces_five_member_limit(baker):
    admin, tenant = _make_admin(baker)
    for i in range(4):
        u = baker.make("auth.User")
        baker.make("tenants.TenantMembership", user=u, tenant=tenant, role="member")

    client = _authed_client(admin)
    response = client.post(
        reverse("api:tenant_invite_user"),
        {"name": "X", "email": "sextomembro@example.com", "password": "senha123", "role": "member"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


# --- TenantCompanyViewSet --------------------------------------------------

def test_create_tenant_company_within_limit(baker):
    # _make_admin's Tenant auto-provisions one default TenantCompany
    # (sequence_number="1") via a post_save signal, so this second company
    # (sequence_number="2") stays within the max_companies_per_tenant=2 limit.
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant-company-list"),
        {"name": "Empresa 2", "sequence_number": "2"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 201


def test_create_tenant_company_rejects_beyond_max_limit(baker):
    admin, tenant = _make_admin(baker)
    baker.make("tenants.TenantCompany", tenant=tenant, sequence_number="2")
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant-company-list"),
        {"name": "Empresa 3", "sequence_number": "3"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 400


def test_create_tenant_company_requires_admin(baker):
    member, tenant = _make_admin(baker, role="member")
    client = _authed_client(member)

    response = client.post(
        reverse("api:tenant-company-list"),
        {"name": "Empresa 1", "sequence_number": "1"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 403


# --- TenantMembershipViewSet actions ---------------------------------------

def test_member_action_updates_role_and_profile(baker):
    admin, tenant = _make_admin(baker)
    target_user = baker.make("auth.User", email="antigo@example.com")
    membership = baker.make(
        "tenants.TenantMembership", user=target_user, tenant=tenant, role="member"
    )
    client = _authed_client(admin)

    url = reverse("api:tenant-membership-member", args=[membership.id])
    response = client.patch(
        url,
        {"name": "Nome Novo", "email": "novo@example.com", "role": "admin"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 200
    membership.refresh_from_db()
    target_user.refresh_from_db()
    assert membership.role == "admin"
    assert target_user.email == "novo@example.com"
    assert target_user.first_name == "Nome"


def test_member_action_rejects_membership_from_another_tenant(baker):
    admin, tenant = _make_admin(baker)
    other_tenant = baker.make("tenants.Tenant", document="99999999999", is_active=True)
    other_user = baker.make("auth.User")
    other_membership = baker.make(
        "tenants.TenantMembership", user=other_user, tenant=other_tenant, role="member"
    )
    client = _authed_client(admin)

    url = reverse("api:tenant-membership-member", args=[other_membership.id])
    response = client.patch(
        url,
        {"name": "X", "email": "x@example.com", "role": "member"},
        HTTP_X_TENANT_ID=str(tenant.id),
    )

    assert response.status_code == 404


def test_companies_action_assigns_company_access(baker):
    admin, tenant = _make_admin(baker)
    company = baker.make("tenants.TenantCompany", tenant=tenant, sequence_number="2", is_active=True)
    target_user = baker.make("auth.User")
    membership = baker.make(
        "tenants.TenantMembership", user=target_user, tenant=tenant, role="member"
    )
    client = _authed_client(admin)

    url = reverse("api:tenant-membership-companies", args=[membership.id])
    response = client.patch(
        url, {"company_ids": [company.id]}, format="json", HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 200
    from tenants.models import TenantCompanyAccess
    assert TenantCompanyAccess.objects.filter(membership=membership, company=company).exists()


def test_companies_action_rejects_company_from_another_tenant(baker):
    admin, tenant = _make_admin(baker)
    other_tenant = baker.make("tenants.Tenant", document="99999999999", is_active=True)
    other_company = baker.make("tenants.TenantCompany", tenant=other_tenant, sequence_number="2")
    target_user = baker.make("auth.User")
    membership = baker.make(
        "tenants.TenantMembership", user=target_user, tenant=tenant, role="member"
    )
    client = _authed_client(admin)

    url = reverse("api:tenant-membership-companies", args=[membership.id])
    response = client.patch(
        url, {"company_ids": [other_company.id]}, format="json", HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 400


def test_companies_action_rejects_owner_or_admin_target(baker):
    admin, tenant = _make_admin(baker)
    other_admin = baker.make("auth.User")
    other_membership = baker.make(
        "tenants.TenantMembership", user=other_admin, tenant=tenant, role="admin"
    )
    client = _authed_client(admin)

    url = reverse("api:tenant-membership-companies", args=[other_membership.id])
    response = client.patch(url, {"company_ids": []}, format="json", HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 400


# --- TenantResetView --------------------------------------------------------

def test_reset_requires_password(baker):
    admin, tenant = _make_admin(baker)
    client = _authed_client(admin)

    response = client.post(reverse("api:tenant_reset"), {}, HTTP_X_TENANT_ID=str(tenant.id))

    assert response.status_code == 400


def test_reset_rejects_wrong_password(baker):
    admin, tenant = _make_admin(baker)
    admin.set_password("correta123")
    admin.save()
    client = _authed_client(admin)

    response = client.post(
        reverse("api:tenant_reset"), {"password": "errada"}, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 403


def test_reset_deletes_only_current_tenant_data(baker):
    admin, tenant = _make_admin(baker)
    admin.set_password("correta123")
    admin.save()

    other_tenant = baker.make("tenants.Tenant", document="99999999999", is_active=True)
    account = baker.make("accounts.Account", tenant=tenant)
    other_account = baker.make("accounts.Account", tenant=other_tenant)

    client = _authed_client(admin)
    response = client.post(
        reverse("api:tenant_reset"), {"password": "correta123"}, HTTP_X_TENANT_ID=str(tenant.id)
    )

    assert response.status_code == 200
    from accounts.models import Account
    assert not Account.objects.filter(pk=account.pk).exists()
    assert Account.objects.filter(pk=other_account.pk).exists()
