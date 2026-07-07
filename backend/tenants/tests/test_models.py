import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError

from tenants.models import Tenant


@pytest.mark.django_db
def test_tenant_save_normalizes_document_and_sets_person_type_pf(baker):
    """CPF com mascara deve ser normalizado para 11 digitos e marcado como PF."""
    owner = baker.make("auth.User")

    tenant = Tenant(name="Cliente PF", slug="cliente-pf", owner=owner, document="123.456.789-01")
    tenant.save()

    assert tenant.document == "12345678901"
    assert tenant.person_type == Tenant.PersonType.PF


@pytest.mark.django_db
def test_tenant_save_normalizes_document_and_sets_person_type_pj(baker):
    """CNPJ com mascara deve ser normalizado para 14 digitos e marcado como PJ."""
    owner = baker.make("auth.User")

    tenant = Tenant(name="Cliente PJ", slug="cliente-pj", owner=owner, document="12.345.678/0001-95")
    tenant.save()

    assert tenant.document == "12345678000195"
    assert tenant.person_type == Tenant.PersonType.PJ


@pytest.mark.django_db
def test_tenant_save_raises_when_document_missing(baker):
    """Sem CPF/CNPJ, o save deve falhar com ValidationError."""
    owner = baker.make("auth.User")

    tenant = Tenant(name="Sem Documento", slug="sem-documento", owner=owner, document="")

    with pytest.raises(ValidationError):
        tenant.save()


@pytest.mark.django_db
def test_tenant_save_raises_when_document_has_invalid_length(baker):
    """CPF/CNPJ com quantidade de digitos invalida deve falhar com ValidationError."""
    owner = baker.make("auth.User")

    tenant = Tenant(name="Documento Invalido", slug="documento-invalido", owner=owner, document="123")

    with pytest.raises(ValidationError):
        tenant.save()


@pytest.mark.django_db
def test_tenant_full_address_combines_all_parts(baker):
    """full_address deve combinar logradouro, cidade/UF e CEP."""
    owner = baker.make("auth.User")
    tenant = baker.make(
        "tenants.Tenant",
        owner=owner,
        document="00000000000",
        address="Rua das Flores",
        address_number="123",
        address_complement="",
        district="Centro",
        city="Sao Paulo",
        state="SP",
        postal_code="01000-000",
    )

    assert tenant.formatted_address_line == "Rua das Flores, 123, Centro"
    assert tenant.formatted_city_state == "Sao Paulo - SP"
    assert tenant.full_address == "Rua das Flores, 123, Centro | Sao Paulo - SP | CEP 01000-000"


@pytest.mark.django_db
def test_tenant_full_address_omits_missing_parts(baker):
    """Campos de endereco vazios nao devem gerar separadores sobrando."""
    owner = baker.make("auth.User")
    tenant = baker.make(
        "tenants.Tenant",
        owner=owner,
        document="00000000000",
        address="",
        address_number="",
        address_complement="",
        district="",
        city="Sao Paulo",
        state="",
        postal_code="",
    )

    assert tenant.formatted_address_line == ""
    assert tenant.formatted_city_state == "Sao Paulo"
    assert tenant.full_address == "Sao Paulo"


@pytest.mark.django_db
def test_tenant_company_unique_default_per_tenant(baker):
    """Apenas uma empresa padrao e permitida por tenant.

    Criar o tenant ja dispara o signal que cria a empresa padrao automaticamente
    (ver tenants/signals.py), entao uma segunda empresa is_default=True deve falhar.
    """
    owner = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", owner=owner, document="00000000000")

    with pytest.raises(IntegrityError):
        baker.make("tenants.TenantCompany", tenant=tenant, sequence_number="0002", is_default=True)


@pytest.mark.django_db
def test_tenant_membership_unique_per_tenant_and_user(baker):
    """Um usuario nao pode ter duas associacoes com o mesmo tenant."""
    owner = baker.make("auth.User")
    tenant = baker.make("tenants.Tenant", owner=owner, document="00000000000")
    user = baker.make("auth.User")
    baker.make("tenants.TenantMembership", tenant=tenant, user=user)

    with pytest.raises(IntegrityError):
        baker.make("tenants.TenantMembership", tenant=tenant, user=user)


@pytest.mark.django_db
def test_tenant_membership_unique_default_per_user(baker):
    """Um usuario nao pode ter dois tenants marcados como padrao."""
    owner = baker.make("auth.User")
    tenant_a = baker.make("tenants.Tenant", owner=owner, document="00000000000")
    tenant_b = baker.make("tenants.Tenant", owner=owner, document="11111111111")
    user = baker.make("auth.User")
    baker.make("tenants.TenantMembership", tenant=tenant_a, user=user, is_default=True)

    with pytest.raises(IntegrityError):
        baker.make("tenants.TenantMembership", tenant=tenant_b, user=user, is_default=True)
