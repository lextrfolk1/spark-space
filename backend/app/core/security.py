from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet


def _fernet_key(raw_value: str) -> bytes:
    if len(raw_value) == 44:
        return raw_value.encode("utf-8")
    digest = hashlib.sha256(raw_value.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


class CredentialCipher:
    def __init__(self, secret: str) -> None:
        self._fernet = Fernet(_fernet_key(secret))

    def encrypt(self, value: str | None) -> str | None:
        if not value:
            return None
        return self._fernet.encrypt(value.encode("utf-8")).decode("utf-8")

    def decrypt(self, value: str | None) -> str | None:
        if not value:
            return None
        return self._fernet.decrypt(value.encode("utf-8")).decode("utf-8")

