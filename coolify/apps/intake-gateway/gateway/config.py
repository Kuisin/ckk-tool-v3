"""config.py — 環境変数の読み取り。全部ここ 1 か所で解決する。

「未設定なら機能ごと無効」を徹底する（nextjs-web の INTAKE_DIR と同じ規約）。
黙って既定値で動き出すより、無効だとログに 1 行出して待つほうが安全。
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name, "").strip().lower()
    if not raw:
        return default
    return raw not in ("0", "false", "no", "off")


@dataclass(frozen=True)
class Config:
    intake_dir: str
    host: str
    port: int
    ssl: bool
    user: str
    password: str
    box: str
    processed_box: str
    failed_box: str
    poll_seconds: int
    max_messages: int
    since_days: int
    allow_from: tuple[str, ...]

    @property
    def configured(self) -> bool:
        return bool(self.host and self.user and self.password and self.intake_dir)

    def why_disabled(self) -> str | None:
        """無効な理由（有効なら None）。ログに出して原因を明示する。"""
        if not self.host:
            return "INTAKE_MAIL_HOST が未設定です"
        if not self.user:
            return "INTAKE_MAIL_USER が未設定です"
        if not self.password:
            return "INTAKE_MAIL_PASSWORD が未設定です"
        if not self.intake_dir:
            return "INTAKE_DIR が未設定です"
        return None

    def sender_allowed(self, sender: str) -> bool:
        """許可リストが空なら全部通す。指定時は部分一致（ドメインでも書ける）。"""
        if not self.allow_from:
            return True
        low = (sender or "").lower()
        return any(rule in low for rule in self.allow_from)


def load() -> Config:
    allow = os.environ.get("INTAKE_MAIL_ALLOW_FROM", "")
    return Config(
        intake_dir=os.environ.get("INTAKE_DIR", "").strip(),
        host=os.environ.get("INTAKE_MAIL_HOST", "").strip(),
        port=_int("INTAKE_MAIL_PORT", 993),
        ssl=_bool("INTAKE_MAIL_SSL", True),
        user=os.environ.get("INTAKE_MAIL_USER", "").strip(),
        password=os.environ.get("INTAKE_MAIL_PASSWORD", ""),
        box=os.environ.get("INTAKE_MAIL_BOX", "INBOX").strip() or "INBOX",
        processed_box=os.environ.get("INTAKE_MAIL_PROCESSED_BOX", "Processed").strip(),
        failed_box=os.environ.get("INTAKE_MAIL_FAILED_BOX", "").strip(),
        poll_seconds=_int("INTAKE_MAIL_POLL_SECONDS", 120),
        max_messages=_int("INTAKE_MAIL_MAX_MESSAGES", 20),
        since_days=_int("INTAKE_MAIL_SINCE_DAYS", 7),
        allow_from=tuple(
            s.strip().lower() for s in allow.split(",") if s.strip()
        ),
    )
