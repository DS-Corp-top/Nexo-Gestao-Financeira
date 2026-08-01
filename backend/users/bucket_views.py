"""Bucket / media-storage management views (superuser only).

Provides a file-explorer-like API over whichever STORAGE_PROVIDER is active
(local disk, S3, GCS, Azure). Endpoints:

  GET  /api/v1/system/bucket/           — list objects in a prefix/directory
  GET  /api/v1/system/bucket/stats/     — aggregate stats (total files, size)
  DELETE /api/v1/system/bucket/object/  — delete a single object by key
"""

import logging
import os
from pathlib import Path, PurePosixPath

from django.conf import settings
from django.core.files.storage import default_storage
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

audit_logger = logging.getLogger("nexo.audit")


class IsSuperuser(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_superuser)


def _human_size(nbytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(nbytes) < 1024:
            return f"{nbytes:.1f} {unit}" if unit != "B" else f"{nbytes} {unit}"
        nbytes /= 1024
    return f"{nbytes:.1f} PB"


def _get_storage_provider_label() -> str:
    provider = getattr(settings, "STORAGE_PROVIDER", "local")
    labels = {
        "local": "Local (FileSystem)",
        "s3": f'Amazon S3 ({getattr(settings, "AWS_STORAGE_BUCKET_NAME", "?")})',
        "gcs": f'Google Cloud Storage ({getattr(settings, "GS_BUCKET_NAME", "?")})',
        "azure": f'Azure Blob ({getattr(settings, "AZURE_CONTAINER", "?")})',
    }
    return labels.get(provider, provider)


# ─── Local filesystem helpers ──────────────────────────────────────────────────

def _local_list(prefix: str):
    """Walk the local MEDIA_ROOT for a given sub-directory prefix."""
    base = Path(settings.MEDIA_ROOT)
    target = base / prefix if prefix else base

    if not target.exists() or not target.is_dir():
        return [], []

    folders = []
    files = []

    for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
        rel = entry.relative_to(base).as_posix()
        if entry.is_dir():
            # Count children recursively
            child_count = sum(1 for _ in entry.rglob("*") if _.is_file())
            dir_size = sum(f.stat().st_size for f in entry.rglob("*") if f.is_file())
            folders.append({
                "name": entry.name,
                "key": rel + "/",
                "type": "folder",
                "children_count": child_count,
                "size": dir_size,
                "size_display": _human_size(dir_size),
            })
        else:
            stat = entry.stat()
            files.append({
                "name": entry.name,
                "key": rel,
                "type": "file",
                "size": stat.st_size,
                "size_display": _human_size(stat.st_size),
                "modified": stat.st_mtime,
            })

    return folders, files


def _local_stats():
    """Aggregate stats for local MEDIA_ROOT."""
    base = Path(settings.MEDIA_ROOT)
    total_files = 0
    total_size = 0
    type_breakdown: dict[str, int] = {}

    if not base.exists():
        return {
            "total_files": 0,
            "total_size": 0,
            "total_size_display": "0 B",
            "type_breakdown": {},
            "top_folders": [],
        }

    for f in base.rglob("*"):
        if f.is_file():
            total_files += 1
            fsize = f.stat().st_size
            total_size += fsize
            ext = f.suffix.lower().lstrip(".") or "sem extensão"
            type_breakdown[ext] = type_breakdown.get(ext, 0) + 1

    # Top-level folder sizes
    top_folders = []
    if base.exists():
        for entry in sorted(base.iterdir()):
            if entry.is_dir():
                folder_size = sum(ff.stat().st_size for ff in entry.rglob("*") if ff.is_file())
                folder_count = sum(1 for ff in entry.rglob("*") if ff.is_file())
                top_folders.append({
                    "name": entry.name,
                    "files": folder_count,
                    "size": folder_size,
                    "size_display": _human_size(folder_size),
                })

    top_folders.sort(key=lambda x: x["size"], reverse=True)

    return {
        "total_files": total_files,
        "total_size": total_size,
        "total_size_display": _human_size(total_size),
        "type_breakdown": dict(sorted(type_breakdown.items(), key=lambda x: -x[1])[:20]),
        "top_folders": top_folders[:10],
    }


def _local_delete(key: str) -> bool:
    """Delete a local file by its relative path key."""
    target = Path(settings.MEDIA_ROOT) / key
    if not target.exists() or not target.is_file():
        return False
    # Safety: ensure it's actually under MEDIA_ROOT
    try:
        target.resolve().relative_to(Path(settings.MEDIA_ROOT).resolve())
    except ValueError:
        return False
    target.unlink()
    return True


# ─── Cloud storage helpers (django-storages) ─────────────────────────────────

def _cloud_list(prefix: str):
    """List using django default_storage (works with S3, GCS, Azure)."""
    folders_list = []
    files_list = []

    try:
        dirs, files = default_storage.listdir(prefix)
    except (FileNotFoundError, OSError):
        return [], []

    for d in sorted(dirs):
        if not d:
            continue
        key = f"{prefix}{d}/" if prefix else f"{d}/"
        folders_list.append({
            "name": d,
            "key": key,
            "type": "folder",
            "children_count": None,
            "size": None,
            "size_display": "—",
        })

    for f in sorted(files):
        if not f:
            continue
        key = f"{prefix}{f}" if prefix else f
        try:
            size = default_storage.size(key)
        except Exception:
            size = 0
        try:
            modified = default_storage.get_modified_time(key)
            modified_ts = modified.timestamp() if modified else None
        except Exception:
            modified_ts = None

        files_list.append({
            "name": f,
            "key": key,
            "type": "file",
            "size": size,
            "size_display": _human_size(size),
            "modified": modified_ts,
        })

    return folders_list, files_list


def _cloud_delete(key: str) -> bool:
    """Delete an object from cloud storage."""
    try:
        if default_storage.exists(key):
            default_storage.delete(key)
            return True
    except Exception:
        pass
    return False


# ─── Views ─────────────────────────────────────────────────────────────────────

def _is_local():
    return getattr(settings, "STORAGE_PROVIDER", "local") == "local"


class BucketListView(APIView):
    """GET /api/v1/system/bucket/ — list objects at a given prefix."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        prefix = request.query_params.get("prefix", "").strip("/")
        if prefix:
            prefix += "/"

        if _is_local():
            folders, files = _local_list(prefix.rstrip("/"))
        else:
            folders, files = _cloud_list(prefix)

        # Build breadcrumbs from prefix
        breadcrumbs = [{"name": "Raiz", "prefix": ""}]
        if prefix:
            parts = prefix.strip("/").split("/")
            for i, part in enumerate(parts):
                breadcrumbs.append({
                    "name": part,
                    "prefix": "/".join(parts[: i + 1]) + "/",
                })

        return Response({
            "provider": _get_storage_provider_label(),
            "prefix": prefix,
            "breadcrumbs": breadcrumbs,
            "folders": folders,
            "files": files,
            "total_items": len(folders) + len(files),
        })


class BucketStatsView(APIView):
    """GET /api/v1/system/bucket/stats/ — aggregate bucket statistics."""
    permission_classes = [IsSuperuser]

    def get(self, request):
        if _is_local():
            stats = _local_stats()
        else:
            # For cloud providers, a full scan is expensive; we return
            # partial information from a shallow listing.
            stats = {
                "total_files": "—",
                "total_size": "—",
                "total_size_display": "Não disponível (storage remoto)",
                "type_breakdown": {},
                "top_folders": [],
                "note": "Estatísticas completas não estão disponíveis para storage remoto. Navegue pelas pastas para inspecionar individualmente.",
            }

        stats["provider"] = _get_storage_provider_label()
        stats["media_root"] = str(settings.MEDIA_ROOT) if _is_local() else "—"
        return Response(stats)


class BucketDeleteView(APIView):
    """DELETE /api/v1/system/bucket/object/ — delete a single object."""
    permission_classes = [IsSuperuser]

    def delete(self, request):
        key = request.query_params.get("key", "").strip()
        if not key:
            return Response(
                {"detail": "Parâmetro 'key' é obrigatório."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Prevent path traversal
        normalized = PurePosixPath(key)
        if ".." in normalized.parts:
            return Response(
                {"detail": "Caminho inválido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audit_logger.warning(
            "bucket_delete: user=%s key=%s",
            request.user.username,
            key,
        )

        if _is_local():
            ok = _local_delete(key)
        else:
            ok = _cloud_delete(key)

        if ok:
            return Response({"detail": f"Arquivo '{key}' removido com sucesso."})
        return Response(
            {"detail": f"Arquivo '{key}' não encontrado ou não pôde ser removido."},
            status=status.HTTP_404_NOT_FOUND,
        )
