"""Shared helpers for user-uploaded file attachments (Drive documents, todo
attachments, etc.) — one place for the hashing and validation policy so every
upload path stays consistent."""

import hashlib

from rest_framework import serializers

MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024  # 50 MB

# Denylist (not allowlist) — these features store arbitrary business
# documents (PDFs, spreadsheets, images, etc.), so we only block file types
# that are dangerous to host/serve rather than restrict to a fixed set of
# "safe" extensions.
BLOCKED_ATTACHMENT_EXTENSIONS = {
    "html", "htm", "svg", "xhtml", "shtml",
    "js", "mjs", "php", "phtml", "asp", "aspx", "jsp",
    "exe", "dll", "msi", "bat", "cmd", "com", "scr", "vbs", "ps1", "sh",
}


def compute_file_hash(file_field) -> str:
    """SHA-256 of the file's bytes, used to detect duplicate uploads."""
    file_field.seek(0)
    hasher = hashlib.sha256()
    for chunk in file_field.chunks():
        hasher.update(chunk)
    file_field.seek(0)
    return hasher.hexdigest()


def validate_attachment_file(file):
    if file is None:
        return file
    ext = file.name.rsplit(".", 1)[-1].lower() if "." in file.name else ""
    if ext in BLOCKED_ATTACHMENT_EXTENSIONS:
        raise serializers.ValidationError(f"Tipo de arquivo não permitido: .{ext}.")
    if file.size > MAX_ATTACHMENT_BYTES:
        raise serializers.ValidationError("O arquivo deve ter no máximo 50 MB.")
    return file
