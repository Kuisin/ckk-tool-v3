"""Thin client for the restore-agent (db-backup stack).

The operator-facing WebUI never touches the Docker socket or the backup tree —
it only proxies to the restore-agent over the shared-db network with a bearer
token. RESTORE_AGENT_URL empty → the バックアップ/復元 app is shown as disabled.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

AGENT_URL = os.environ.get("RESTORE_AGENT_URL", "").rstrip("/")  # e.g. http://restore-agent:9000
AGENT_TOKEN = os.environ.get("RESTORE_AGENT_TOKEN", "")


def enabled() -> bool:
    return bool(AGENT_URL and AGENT_TOKEN)


def _call(method: str, path: str, body: dict | None = None, timeout: int = 60) -> dict:
    if not enabled():
        return {"error": "restore agent not configured (RESTORE_AGENT_URL / RESTORE_AGENT_TOKEN)"}
    req = urllib.request.Request(
        f"{AGENT_URL}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {AGENT_TOKEN}",
                 "Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 (internal, token-auth)
            raw = r.read().decode("utf-8", "replace")
        return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("detail", detail)
        except Exception:  # noqa: BLE001
            pass
        return {"error": f"{e.code}: {detail}"[:300]}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


def health() -> dict:
    return _call("GET", "/healthz", timeout=10)


def list_backups() -> dict:
    return _call("GET", "/backups")


def list_app_versions() -> dict:
    return _call("GET", "/app-versions", timeout=40)


def status() -> dict:
    return _call("GET", "/status", timeout=10)


def snapshot(reason: str, actor: str) -> dict:
    return _call("POST", "/snapshot", {"reason": reason, "actor": actor})


def restore(db_source: str | None, storage_source: str | None, app_version: str | None,
            skip_snapshot: bool, actor: str, confirm: str) -> dict:
    return _call("POST", "/restore", {
        "db_source": db_source or None,
        "storage_source": storage_source or None,
        "app_version": app_version or None,
        "skip_snapshot": skip_snapshot,
        "actor": actor,
        "confirm": confirm,
    })
