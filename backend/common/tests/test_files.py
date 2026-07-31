import pytest
from rest_framework.exceptions import ValidationError

from common.files import MAX_ATTACHMENT_BYTES, compute_file_hash, validate_attachment_file


class _FakeFile:
    """Lightweight stand-in for an UploadedFile — avoids allocating a real
    50MB+ buffer just to exercise the size check."""

    def __init__(self, name, size):
        self.name = name
        self.size = size


def test_validate_attachment_file_allows_none():
    assert validate_attachment_file(None) is None


def test_validate_attachment_file_rejects_oversized_file():
    fake = _FakeFile("relatorio.pdf", MAX_ATTACHMENT_BYTES + 1)
    with pytest.raises(ValidationError):
        validate_attachment_file(fake)


def test_validate_attachment_file_allows_file_at_the_limit():
    fake = _FakeFile("relatorio.pdf", MAX_ATTACHMENT_BYTES)
    assert validate_attachment_file(fake) is fake


def test_validate_attachment_file_rejects_blocked_extension_case_insensitively():
    fake = _FakeFile("script.EXE", 100)
    with pytest.raises(ValidationError):
        validate_attachment_file(fake)


def test_validate_attachment_file_allows_safe_extension():
    fake = _FakeFile("relatorio.pdf", 100)
    assert validate_attachment_file(fake) is fake


def test_compute_file_hash_is_stable_for_same_content():
    from django.core.files.uploadedfile import SimpleUploadedFile

    content = b"conteudo identico"
    file_a = SimpleUploadedFile("a.txt", content)
    file_b = SimpleUploadedFile("b.txt", content)

    assert compute_file_hash(file_a) == compute_file_hash(file_b)


def test_compute_file_hash_differs_for_different_content():
    from django.core.files.uploadedfile import SimpleUploadedFile

    file_a = SimpleUploadedFile("a.txt", b"conteudo 1")
    file_b = SimpleUploadedFile("b.txt", b"conteudo 2")

    assert compute_file_hash(file_a) != compute_file_hash(file_b)
