"""Symmetric encryption for the admin credentials stored in the DB (SAKURA_ID/PW,
KOT_ID/PW), so they aren't sitting there as plaintext.

**Twin file — keep these two byte-identical** (verify with a plain `diff`):
  coolify/apps/admintools/app/secret_box.py
  coolify/common/kot-import/kot/secret_box.py
They can't share a module: the two live in separate containers with separate
images and no shared package. adminTools is the only writer (encrypt on save);
both sides decrypt.

CRED_ENCRYPTION_KEY must hold the SAME Fernet key in both apps' Coolify env, or
kot-import cannot read a credential saved in adminTools. Generate one with:
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken

_ENV_KEY = "CRED_ENCRYPTION_KEY"


def _fernet() -> Fernet | None:
    key = os.environ.get(_ENV_KEY, "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError):  # malformed key — treat as "not configured"
        return None


def encrypt(value: str) -> str:
    """Raises if CRED_ENCRYPTION_KEY is unset/malformed — never fall back to
    storing plaintext."""
    f = _fernet()
    if f is None:
        raise RuntimeError(f"{_ENV_KEY} is not set (or is not a valid Fernet key) — cannot store credentials.")
    return f.encrypt(value.encode()).decode()


def decrypt(token: str) -> str:
    """Empty string on any failure (no key / wrong key / corrupt token) — callers
    treat that the same as "not configured" and fall back to env vars."""
    if not token:
        return ""
    f = _fernet()
    if f is None:
        return ""
    try:
        return f.decrypt(token.encode()).decode()
    except InvalidToken:
        return ""
