import json

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from drive.models import Document
from tenants.models import Tenant, TenantCompany

BACKEND_PATHS = {
    "s3": "storages.backends.s3boto3.S3Boto3Storage",
    "gcs": "storages.backends.gcloud.GoogleCloudStorage",
    "azure": "storages.backends.azure_storage.AzureStorage",
}


def _import_class(dotted_path):
    module_path, class_name = dotted_path.rsplit(".", 1)
    module = __import__(module_path, fromlist=[class_name])
    return getattr(module, class_name)


def build_destination_storage(provider, options):
    """Instantiate a Storage object for `provider` straight from CLI options —
    independent of whatever STORAGE_PROVIDER/credentials are currently active
    in settings. Lets this command copy files into a brand new provider
    *before* the app is switched over to it.
    """
    if provider == "s3":
        if not all([options["s3_bucket"], options["s3_access_key"], options["s3_secret_key"]]):
            raise CommandError("--s3-bucket, --s3-access-key e --s3-secret-key são obrigatórios para --to s3.")
        cls = _import_class(BACKEND_PATHS["s3"])
        return cls(
            bucket_name=options["s3_bucket"],
            access_key=options["s3_access_key"],
            secret_key=options["s3_secret_key"],
            region_name=options["s3_region"] or "us-east-1",
        )

    if provider == "gcs":
        if not options["gcs_bucket"]:
            raise CommandError("--gcs-bucket é obrigatório para --to gcs.")
        cls = _import_class(BACKEND_PATHS["gcs"])
        kwargs = {"bucket_name": options["gcs_bucket"]}
        if options["gcs_project_id"]:
            kwargs["project_id"] = options["gcs_project_id"]
        if options["gcs_credentials_json"]:
            from google.oauth2 import service_account

            kwargs["credentials"] = service_account.Credentials.from_service_account_info(
                json.loads(options["gcs_credentials_json"])
            )
        return cls(**kwargs)

    if provider == "azure":
        if not all([options["azure_account"], options["azure_key"], options["azure_container"]]):
            raise CommandError("--azure-account, --azure-key e --azure-container são obrigatórios para --to azure.")
        cls = _import_class(BACKEND_PATHS["azure"])
        return cls(
            account_name=options["azure_account"],
            account_key=options["azure_key"],
            azure_container=options["azure_container"],
        )

    raise CommandError(f"Provider desconhecido: {provider}")


def iter_media_fields():
    """Yields (label, file_name) for every non-empty file/image field in the
    app. Add new entries here whenever a new FileField/ImageField is added
    to a model — this command has no way to discover them automatically.
    """
    for tenant in Tenant.objects.exclude(logo="").exclude(logo__isnull=True):
        yield f"Tenant#{tenant.id} ({tenant.name})", tenant.logo.name
    for company in TenantCompany.objects.exclude(logo="").exclude(logo__isnull=True):
        yield f"TenantCompany#{company.id} ({company.name})", company.logo.name
    for document in Document.objects.exclude(file=""):
        yield f"Document#{document.id} ({document.title})", document.file.name


class Command(BaseCommand):
    help = (
        "Copia todos os arquivos de midia (logos de tenant/empresa, documentos do "
        "Drive) do storage ATUALMENTE configurado (default_storage / STORAGE_PROVIDER) "
        "para um storage de destino informado via argumentos, preservando o mesmo "
        "caminho relativo. Nao altera nenhuma linha do banco — os FileField/ImageField "
        "ja guardam so o caminho relativo, que funciona igual em qualquer provider. "
        "Depois de rodar isso e conferir que os arquivos chegaram no destino, basta "
        "trocar STORAGE_PROVIDER (+ credenciais) nas config vars para o app passar a "
        "usar o novo storage."
    )

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, choices=["s3", "gcs", "azure"], help="Provider de destino.")
        parser.add_argument("--dry-run", action="store_true", help="So lista o que seria copiado, sem enviar nada.")

        parser.add_argument("--s3-bucket", default=None)
        parser.add_argument("--s3-access-key", default=None)
        parser.add_argument("--s3-secret-key", default=None)
        parser.add_argument("--s3-region", default=None)

        parser.add_argument("--gcs-bucket", default=None)
        parser.add_argument("--gcs-project-id", default=None)
        parser.add_argument("--gcs-credentials-json", default=None, help="Conteudo JSON da service account (nao o caminho do arquivo).")

        parser.add_argument("--azure-account", default=None)
        parser.add_argument("--azure-key", default=None)
        parser.add_argument("--azure-container", default=None)

    def handle(self, *args, **options):
        destination = build_destination_storage(options["to"], options)
        source = default_storage
        dry_run = options["dry_run"]

        copied = skipped = failed = 0
        for label, name in iter_media_fields():
            if not name:
                continue

            if destination.exists(name):
                skipped += 1
                self.stdout.write(f"[skip] {label}: {name} (ja existe no destino)")
                continue

            if dry_run:
                self.stdout.write(f"[dry-run] copiaria {label}: {name}")
                continue

            try:
                with source.open(name, "rb") as fh:
                    destination.save(name, ContentFile(fh.read()))
                copied += 1
                self.stdout.write(f"[ok] {label}: {name}")
            except Exception as exc:
                failed += 1
                self.stderr.write(f"[erro] {label}: {name} -> {exc}")

        summary = f"Concluido. Copiados: {copied}, ja existentes: {skipped}, falhas: {failed}."
        if failed:
            self.stdout.write(self.style.WARNING(summary))
        else:
            self.stdout.write(self.style.SUCCESS(summary))
