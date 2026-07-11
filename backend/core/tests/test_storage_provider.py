import json
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

# STORAGE_PROVIDER is resolved at settings *import* time, so overriding it via
# Django's override_settings (which patches an already-loaded settings
# object) can't exercise the branch selection logic. Running a fresh
# interpreter per case is the only way to test what the module actually does
# for a given environment.
SNIPPET = """
import django, json
django.setup()
from django.conf import settings
print(json.dumps({
    "backend": settings.STORAGES["default"]["BACKEND"],
    "media_url": settings.MEDIA_URL,
}))
"""


def _run_with_env(env_overrides):
    env = {
        "PATH": os.environ.get("PATH", ""),
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
        "DJANGO_SECRET_KEY": "test-only-key",
        "DJANGO_SETTINGS_MODULE": "core.settings",
        **env_overrides,
    }
    result = subprocess.run(
        [sys.executable, "-c", SNIPPET],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout.strip().splitlines()[-1])


def test_defaults_to_local_filesystem_storage_without_any_provider_hints():
    config = _run_with_env({})
    assert config["backend"] == "django.core.files.storage.FileSystemStorage"


def test_bucketeer_env_var_alone_selects_s3_for_backwards_compatibility():
    config = _run_with_env({"BUCKETEER_BUCKET_NAME": "my-bucket"})
    assert config["backend"] == "storages.backends.s3boto3.S3Boto3Storage"
    assert "my-bucket.s3." in config["media_url"]


def test_storage_provider_gcs_selects_google_cloud_storage_backend():
    config = _run_with_env({"STORAGE_PROVIDER": "gcs", "GS_BUCKET_NAME": "my-gcs-bucket"})
    assert config["backend"] == "storages.backends.gcloud.GoogleCloudStorage"
    assert "my-gcs-bucket" in config["media_url"]


def test_storage_provider_azure_selects_azure_backend():
    config = _run_with_env(
        {
            "STORAGE_PROVIDER": "azure",
            "AZURE_ACCOUNT_NAME": "myaccount",
            "AZURE_ACCOUNT_KEY": "fake-key",
            "AZURE_CONTAINER": "media",
        }
    )
    assert config["backend"] == "storages.backends.azure_storage.AzureStorage"
    assert "myaccount.blob.core.windows.net/media" in config["media_url"]


def test_explicit_storage_provider_local_overrides_bucketeer_hint():
    config = _run_with_env({"BUCKETEER_BUCKET_NAME": "my-bucket", "STORAGE_PROVIDER": "local"})
    assert config["backend"] == "django.core.files.storage.FileSystemStorage"
