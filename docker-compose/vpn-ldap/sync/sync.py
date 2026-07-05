#!/usr/bin/env python3
"""Sync the Samba AD / LDAP employee directory into PostgreSQL.

Pulls person accounts from AD (via the vpn-ldap forwarder) and upserts them into
`employee_directory` — a shared table read by Metabase, the labor `v_labor` view,
and future apps: department, title (役職), company, active status, email,
employee_code. employee_code comes from AD's `description` field, formatted
`PX番号: <code> (<username>)`. Also refreshes the KOT `employees` (code→username)
map from the same authoritative source. Each run is logged to `ldap_sync_log`.

Callable two ways:
  full_sync()            — all users (periodic + POST /sync)
  sync_user(username)    — one user (login-triggered, POST /sync/<user>)
"""
from __future__ import annotations

import os
import re

import psycopg2
from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.utils.conv import escape_filter_chars

LDAP_HOST = os.environ.get("LDAP_SERVER_HOST", "vpn-ldap")
LDAP_PORT = int(os.environ.get("LDAP_SERVER_PORT", "389"))
BASE = os.environ.get("LDAP_BASE_DN") or os.environ.get("LDAP_SEARCH_BASE", "DC=ckk-tools,DC=loc")
BIND_DN = os.environ.get("LDAP_APP_DN", "")
BIND_PW = os.environ.get("LDAP_APP_PASSWORD", "")
DB_URL = os.environ.get("DATABASE_URL", "")

UF_ACCOUNTDISABLE = 0x0002
# AD description holds the KOT employee code, e.g. "PX番号: 100056 (s.kyou)".
_PX_RE = re.compile(r"PX番号[:：]\s*(\d+)")

DDL = """
CREATE TABLE IF NOT EXISTS employee_directory (
    username      text PRIMARY KEY,
    display_name  text,
    email         text,
    department    text,
    title         text,
    company       text,
    office        text,
    manager       text,
    is_active     boolean,
    employee_code integer,
    last_synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ldap_sync_log (
    id          bigserial PRIMARY KEY,
    finished_at timestamptz NOT NULL DEFAULT now(),
    kind        text,
    status      text,
    total       integer,
    message     text
);
CREATE INDEX IF NOT EXISTS idx_ldap_sync_log_finished ON ldap_sync_log (finished_at DESC);
"""

UPSERT = """
INSERT INTO employee_directory
    (username, display_name, email, department, title, company, office, manager,
     is_active, employee_code, last_synced_at)
VALUES
    (%(username)s, %(display_name)s, %(email)s, %(department)s, %(title)s,
     %(company)s, %(office)s, %(manager)s, %(is_active)s, %(employee_code)s, now())
ON CONFLICT (username) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email,
    department = EXCLUDED.department, title = EXCLUDED.title,
    company = EXCLUDED.company, office = EXCLUDED.office, manager = EXCLUDED.manager,
    is_active = EXCLUDED.is_active,
    employee_code = COALESCE(EXCLUDED.employee_code, employee_directory.employee_code),
    last_synced_at = now()
"""


def _val(entry, attr):
    a = entry[attr]
    if a and a.value:
        return str(a.value).strip() or None
    return None


def _row(e) -> dict:
    uac = 0
    try:
        uac = int(e.userAccountControl.value or 0)
    except Exception:  # noqa: BLE001
        pass
    desc = _val(e, "description") or ""
    m = _PX_RE.search(desc)
    return {
        "username": str(e.sAMAccountName),
        "display_name": _val(e, "displayName"),
        "email": _val(e, "mail"),
        "department": _val(e, "department"),
        "title": _val(e, "title"),
        "company": _val(e, "company"),
        "office": _val(e, "physicalDeliveryOfficeName"),
        "manager": _val(e, "manager"),
        "is_active": not bool(uac & UF_ACCOUNTDISABLE),
        "employee_code": int(m.group(1)) if m else None,
    }


_ATTRS = ["sAMAccountName", "displayName", "mail", "department", "title", "company",
          "physicalDeliveryOfficeName", "manager", "description", "userAccountControl"]


def _connect_ldap() -> Connection:
    if not BIND_DN or not BIND_PW:
        raise SystemExit("LDAP_APP_DN / LDAP_APP_PASSWORD not configured")
    srv = Server(LDAP_HOST, port=LDAP_PORT, get_info=ALL, connect_timeout=10)
    return Connection(srv, BIND_DN, BIND_PW, auto_bind=True, receive_timeout=30)


def _fetch(filter_str: str) -> list[dict]:
    conn = _connect_ldap()
    try:
        conn.search(BASE, filter_str, search_scope=SUBTREE, attributes=_ATTRS, paged_size=500)
        return [_row(e) for e in conn.entries if e.sAMAccountName]
    finally:
        conn.unbind()


def _write(rows: list[dict], kind: str) -> int:
    conn = psycopg2.connect(DB_URL)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(DDL)
        with conn, conn.cursor() as cur:
            for r in rows:
                cur.execute(UPSERT, r)
            # Refresh the KOT code->username map from the authoritative PX codes.
            for r in rows:
                if r["employee_code"] is not None:
                    cur.execute(
                        "INSERT INTO employees (employee_code, username) VALUES (%s,%s) "
                        "ON CONFLICT (employee_code) DO UPDATE SET username = EXCLUDED.username",
                        (r["employee_code"], r["username"]),
                    )
            cur.execute(
                "INSERT INTO ldap_sync_log (kind, status, total, message) VALUES (%s,%s,%s,%s)",
                (kind, "ok", len(rows), f"{len(rows)} users"),
            )
        return len(rows)
    except Exception as e:  # noqa: BLE001
        try:
            with conn, conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO ldap_sync_log (kind, status, total, message) VALUES (%s,%s,%s,%s)",
                    (kind, "failed", 0, str(e)[:1000]),
                )
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        conn.close()


def full_sync() -> int:
    rows = _fetch("(&(objectClass=user)(objectCategory=person)(sAMAccountName=*))")
    n = _write(rows, "full")
    print(f"[ldap-sync] full: {n} users")
    return n


def sync_user(username: str) -> int:
    safe = escape_filter_chars(username)
    rows = _fetch(f"(&(objectClass=user)(objectCategory=person)(sAMAccountName={safe}))")
    if not rows:
        print(f"[ldap-sync] user {username!r} not found")
        return 0
    n = _write(rows, "login")
    print(f"[ldap-sync] login: {username}")
    return n


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        sync_user(sys.argv[1])
    else:
        full_sync()
