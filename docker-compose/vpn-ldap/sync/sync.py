#!/usr/bin/env python3
"""Sync the Samba AD / LDAP employee directory into PostgreSQL.

Pulls person accounts from AD (via the vpn-ldap forwarder) and upserts them into
`employee_directory` — a shared table read by Metabase, the labor `v_labor` view,
and future apps: department, title (役職), company, active status, email,
employee_code, plus extended identity (given_name/sn/cn/upn/dn), contact
(phone/mobile/fax), raw description, group membership (member_of), and AD
timestamps (when_created/when_changed/account_expires). employee_code comes from
AD's `description` field, formatted `PX番号: <code> (<username>)`. Also refreshes
the KOT `employees` (code→username) map from the same authoritative source. Each
run is logged to `ldap_sync_log`.

Callable two ways:
  full_sync()            — all users (periodic + POST /sync)
  sync_user(username)    — one user (login-triggered, POST /sync/<user>)
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone

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
-- ldap_guid: immutable AD objectGUID. The STABLE identity apps FK to, so a
-- username/attribute change updates the same row instead of orphaning refs.
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS ldap_guid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS employee_directory_ldap_guid_key
    ON employee_directory (ldap_guid);
-- Extended AD person attributes (identity, contact, groups, timestamps).
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS given_name      text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS sn              text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS cn              text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS upn             text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS dn              text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS phone           text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS mobile          text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS fax             text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS description     text;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS member_of       text[];
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS when_created    timestamptz;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS when_changed    timestamptz;
ALTER TABLE employee_directory ADD COLUMN IF NOT EXISTS account_expires timestamptz;
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

# Legacy rows predate ldap_guid — backfill by username first so the guid-keyed
# upsert matches them instead of inserting a duplicate.
BACKFILL = """
UPDATE employee_directory SET ldap_guid = %(ldap_guid)s
WHERE username = %(username)s AND ldap_guid IS DISTINCT FROM %(ldap_guid)s
"""

# Conflict on ldap_guid (the stable key), NOT username: an AD rename updates the
# same row in place — username is just another mutable attribute now.
UPSERT = """
INSERT INTO employee_directory
    (username, ldap_guid, display_name, email, department, title, company, office,
     manager, is_active, employee_code, given_name, sn, cn, upn, dn, phone, mobile,
     fax, description, member_of, when_created, when_changed, account_expires,
     last_synced_at)
VALUES
    (%(username)s, %(ldap_guid)s, %(display_name)s, %(email)s, %(department)s,
     %(title)s, %(company)s, %(office)s, %(manager)s, %(is_active)s,
     %(employee_code)s, %(given_name)s, %(sn)s, %(cn)s, %(upn)s, %(dn)s, %(phone)s,
     %(mobile)s, %(fax)s, %(description)s, %(member_of)s, %(when_created)s,
     %(when_changed)s, %(account_expires)s, now())
ON CONFLICT (ldap_guid) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name, email = EXCLUDED.email,
    department = EXCLUDED.department, title = EXCLUDED.title,
    company = EXCLUDED.company, office = EXCLUDED.office, manager = EXCLUDED.manager,
    is_active = EXCLUDED.is_active,
    employee_code = COALESCE(EXCLUDED.employee_code, employee_directory.employee_code),
    given_name = EXCLUDED.given_name, sn = EXCLUDED.sn, cn = EXCLUDED.cn,
    upn = EXCLUDED.upn, dn = EXCLUDED.dn, phone = EXCLUDED.phone,
    mobile = EXCLUDED.mobile, fax = EXCLUDED.fax, description = EXCLUDED.description,
    member_of = EXCLUDED.member_of, when_created = EXCLUDED.when_created,
    when_changed = EXCLUDED.when_changed, account_expires = EXCLUDED.account_expires,
    last_synced_at = now()
"""

# Fallback for the (unexpected) case where AD returns no objectGUID.
UPSERT_NO_GUID = """
INSERT INTO employee_directory
    (username, display_name, email, department, title, company, office, manager,
     is_active, employee_code, given_name, sn, cn, upn, dn, phone, mobile, fax,
     description, member_of, when_created, when_changed, account_expires,
     last_synced_at)
VALUES
    (%(username)s, %(display_name)s, %(email)s, %(department)s, %(title)s,
     %(company)s, %(office)s, %(manager)s, %(is_active)s, %(employee_code)s,
     %(given_name)s, %(sn)s, %(cn)s, %(upn)s, %(dn)s, %(phone)s, %(mobile)s,
     %(fax)s, %(description)s, %(member_of)s, %(when_created)s, %(when_changed)s,
     %(account_expires)s, now())
ON CONFLICT (username) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email,
    department = EXCLUDED.department, title = EXCLUDED.title,
    company = EXCLUDED.company, office = EXCLUDED.office, manager = EXCLUDED.manager,
    is_active = EXCLUDED.is_active,
    employee_code = COALESCE(EXCLUDED.employee_code, employee_directory.employee_code),
    given_name = EXCLUDED.given_name, sn = EXCLUDED.sn, cn = EXCLUDED.cn,
    upn = EXCLUDED.upn, dn = EXCLUDED.dn, phone = EXCLUDED.phone,
    mobile = EXCLUDED.mobile, fax = EXCLUDED.fax, description = EXCLUDED.description,
    member_of = EXCLUDED.member_of, when_created = EXCLUDED.when_created,
    when_changed = EXCLUDED.when_changed, account_expires = EXCLUDED.account_expires,
    last_synced_at = now()
"""


def _val(entry, attr):
    a = entry[attr]
    if a and a.value:
        return str(a.value).strip() or None
    return None


def _multi(entry, attr) -> list[str] | None:
    """Multi-valued attribute (e.g. memberOf) -> list[str], or None if empty."""
    try:
        a = entry[attr]
    except Exception:  # noqa: BLE001
        return None
    if not a:
        return None
    vals = [str(v).strip() for v in (a.values or []) if str(v).strip()]
    return vals or None


# AD GeneralizedTime, e.g. "20240131235959.0Z".
_GENTIME_RE = re.compile(r"^(\d{14})(?:\.\d+)?Z?$")
# 100-ns intervals between 1601-01-01 (AD epoch) and 1970-01-01 (Unix epoch).
_FILETIME_EPOCH_DELTA = 116444736000000000
_FILETIME_NEVER = 0x7FFFFFFFFFFFFFFF


def _dt(entry, attr) -> datetime | None:
    """AD GeneralizedTime -> aware UTC datetime. ldap3 may already parse it."""
    try:
        raw = entry[attr].value
    except Exception:  # noqa: BLE001
        return None
    if not raw:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    m = _GENTIME_RE.match(str(raw).strip())
    if not m:
        return None
    try:
        return datetime.strptime(m.group(1), "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _account_expires(entry) -> datetime | None:
    """AD accountExpires FILETIME -> aware UTC datetime; 0 / max => never (None)."""
    try:
        raw = entry["accountExpires"].value
    except Exception:  # noqa: BLE001
        return None
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=timezone.utc)
    try:
        ft = int(raw)
    except (TypeError, ValueError):
        return None
    if ft <= 0 or ft >= _FILETIME_NEVER:
        return None
    unix_seconds = (ft - _FILETIME_EPOCH_DELTA) / 10_000_000
    try:
        return datetime.fromtimestamp(unix_seconds, tz=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None


def _guid(e) -> str | None:
    """AD objectGUID → canonical UUID string (mixed-endian, as AD tools show)."""
    try:
        raw = e.objectGUID.raw_values[0]
        if isinstance(raw, (bytes, bytearray)) and len(raw) == 16:
            return str(uuid.UUID(bytes_le=bytes(raw)))
    except Exception:  # noqa: BLE001
        pass
    v = _val(e, "objectGUID")
    if v:
        try:
            return str(uuid.UUID(v.strip("{}")))
        except Exception:  # noqa: BLE001
            return None
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
        "ldap_guid": _guid(e),
        "display_name": _val(e, "displayName"),
        "email": _val(e, "mail"),
        "department": _val(e, "department"),
        "title": _val(e, "title"),
        "company": _val(e, "company"),
        "office": _val(e, "physicalDeliveryOfficeName"),
        "manager": _val(e, "manager"),
        "is_active": not bool(uac & UF_ACCOUNTDISABLE),
        "employee_code": int(m.group(1)) if m else None,
        "given_name": _val(e, "givenName"),
        "sn": _val(e, "sn"),
        "cn": _val(e, "cn"),
        "upn": _val(e, "userPrincipalName"),
        "dn": _val(e, "distinguishedName") or str(e.entry_dn),
        "phone": _val(e, "telephoneNumber"),
        "mobile": _val(e, "mobile"),
        "fax": _val(e, "facsimileTelephoneNumber"),
        "description": desc or None,
        "member_of": _multi(e, "memberOf"),
        "when_created": _dt(e, "whenCreated"),
        "when_changed": _dt(e, "whenChanged"),
        "account_expires": _account_expires(e),
    }


_ATTRS = ["sAMAccountName", "objectGUID", "displayName", "mail", "department", "title",
          "company", "physicalDeliveryOfficeName", "manager", "description",
          "userAccountControl", "givenName", "sn", "cn", "userPrincipalName",
          "distinguishedName", "telephoneNumber", "mobile", "facsimileTelephoneNumber",
          "memberOf", "whenCreated", "whenChanged", "accountExpires"]


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
                if r["ldap_guid"]:
                    # Backfill legacy username-keyed rows, then upsert on the guid.
                    cur.execute(BACKFILL, r)
                    cur.execute(UPSERT, r)
                else:
                    cur.execute(UPSERT_NO_GUID, r)
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
