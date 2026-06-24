import base64
import hashlib
import os

from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    # Prefer a dedicated env var so rotating SECRET_KEY doesn't break existing passwords.
    # Fallback to SECRET_KEY derivation for backwards compatibility.
    raw_key = os.getenv("NFSE_CRYPTO_KEY")
    if raw_key:
        key = base64.urlsafe_b64decode(raw_key.encode())
    else:
        key = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_password(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_password(enc: str) -> str:
    return _fernet().decrypt(enc.encode()).decode()
