import pytest
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command

from dashboard.management.commands.migrate_media_storage import (
    build_destination_storage,
    iter_media_fields,
)

pytestmark = pytest.mark.django_db


def _base_options(**overrides):
    options = {
        "s3_bucket": None,
        "s3_access_key": None,
        "s3_secret_key": None,
        "s3_region": None,
        "gcs_bucket": None,
        "gcs_project_id": None,
        "gcs_credentials_json": None,
        "azure_account": None,
        "azure_key": None,
        "azure_container": None,
    }
    options.update(overrides)
    return options


class TestBuildDestinationStorage:
    def test_s3_requires_bucket_and_credentials(self):
        with pytest.raises(CommandError):
            build_destination_storage("s3", _base_options())

    def test_s3_returns_configured_backend(self):
        storage = build_destination_storage(
            "s3",
            _base_options(s3_bucket="b", s3_access_key="a", s3_secret_key="s", s3_region="sa-east-1"),
        )
        assert storage.bucket_name == "b"
        assert storage.access_key == "a"
        assert storage.region_name == "sa-east-1"

    def test_gcs_requires_bucket(self):
        with pytest.raises(CommandError):
            build_destination_storage("gcs", _base_options())

    def test_gcs_returns_configured_backend(self):
        storage = build_destination_storage("gcs", _base_options(gcs_bucket="b", gcs_project_id="p"))
        assert storage.bucket_name == "b"
        assert storage.project_id == "p"

    def test_azure_requires_account_key_and_container(self):
        with pytest.raises(CommandError):
            build_destination_storage("azure", _base_options(azure_account="acc"))

    def test_azure_returns_configured_backend(self):
        storage = build_destination_storage(
            "azure",
            _base_options(azure_account="acc", azure_key="k", azure_container="cont"),
        )
        assert storage.account_name == "acc"
        assert storage.azure_container == "cont"


class TestIterMediaFields:
    def test_skips_records_without_a_file(self, baker):
        tenant = baker.make("tenants.Tenant", document="00000000000", is_active=True)
        baker.make("tenants.TenantCompany", tenant=tenant)  # no logo

        assert list(iter_media_fields()) == []

    def test_yields_tenant_and_company_logos_and_drive_documents(self, baker):
        tenant = baker.make(
            "tenants.Tenant",
            document="00000000000",
            is_active=True,
            slug="acme",
            logo=SimpleUploadedFile("logo.png", b"fake-image-bytes"),
        )
        company = baker.make(
            "tenants.TenantCompany",
            tenant=tenant,
            logo=SimpleUploadedFile("company-logo.png", b"fake-image-bytes"),
        )
        user = baker.make("auth.User")
        document = baker.make(
            "drive.Document",
            tenant=tenant,
            user=user,
            file=SimpleUploadedFile("doc.txt", b"conteudo"),
        )

        results = dict(iter_media_fields())

        assert results[f"Tenant#{tenant.id} ({tenant.name})"] == tenant.logo.name
        assert results[f"TenantCompany#{company.id} ({company.name})"] == company.logo.name
        assert results[f"Document#{document.id} ({document.title})"] == document.file.name


class TestCommandHandle:
    def test_dry_run_does_not_copy_and_reports_no_changes(self, tmp_path, baker, monkeypatch, capsys):
        tenant = baker.make(
            "tenants.Tenant",
            document="00000000000",
            is_active=True,
            slug="acme",
            logo=SimpleUploadedFile("logo.png", b"fake-image-bytes"),
        )

        fake_destination = FileSystemStorage(location=str(tmp_path))
        monkeypatch.setattr(
            "dashboard.management.commands.migrate_media_storage.build_destination_storage",
            lambda provider, options: fake_destination,
        )

        call_command("migrate_media_storage", "--to", "gcs", "--gcs-bucket", "unused", "--dry-run")

        assert not fake_destination.exists(tenant.logo.name)
        out = capsys.readouterr().out
        assert "dry-run" in out
        assert "Copiados: 0" in out

    def test_copies_file_to_destination_storage(self, tmp_path, baker, monkeypatch):
        tenant = baker.make(
            "tenants.Tenant",
            document="00000000000",
            is_active=True,
            slug="acme",
            logo=SimpleUploadedFile("logo.png", b"fake-image-bytes"),
        )

        fake_destination = FileSystemStorage(location=str(tmp_path))
        monkeypatch.setattr(
            "dashboard.management.commands.migrate_media_storage.build_destination_storage",
            lambda provider, options: fake_destination,
        )

        call_command("migrate_media_storage", "--to", "gcs", "--gcs-bucket", "unused")

        assert fake_destination.exists(tenant.logo.name)
        with fake_destination.open(tenant.logo.name, "rb") as fh:
            assert fh.read() == b"fake-image-bytes"

    def test_skips_files_that_already_exist_at_destination(self, tmp_path, baker, monkeypatch, capsys):
        tenant = baker.make(
            "tenants.Tenant",
            document="00000000000",
            is_active=True,
            slug="acme",
            logo=SimpleUploadedFile("logo.png", b"fake-image-bytes"),
        )

        fake_destination = FileSystemStorage(location=str(tmp_path))
        fake_destination.save(tenant.logo.name, SimpleUploadedFile("logo.png", b"already-there"))

        monkeypatch.setattr(
            "dashboard.management.commands.migrate_media_storage.build_destination_storage",
            lambda provider, options: fake_destination,
        )

        call_command("migrate_media_storage", "--to", "gcs", "--gcs-bucket", "unused")

        out = capsys.readouterr().out
        assert "ja existe no destino" in out
        assert "Copiados: 0" in out
        assert "ja existentes: 1" in out
