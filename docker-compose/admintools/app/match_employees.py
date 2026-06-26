#!/usr/bin/env python3
"""Seed the KOT `employees` map (employee_code -> AD username) by name-matching.

KOT exports a Japanese name per employee_code but no AD username; AD has the
username + name parts but no KOT code. This joins the two on name:

  KOT  kot_employees.name            (e.g. "山田 太郎")
  AD   displayName / cn / sn+givenName

A KOT person with exactly one AD name match is "confident" and is written
straight into `employees`. Everyone else (0 or >1 candidates) is written to
`kot_match_review` for a human to resolve. Only aggregate counts are printed so
no employee PII lands in logs.

Run inside the admintools container (has LDAP creds + reach to kot-db):
  docker exec admintools python -m app.match_employees
  docker exec admintools python -m app.match_employees --apply   # default
  docker exec admintools python -m app.match_employees --dry-run # no writes
"""
from __future__ import annotations

import json
import os
import re
import sys
import unicodedata

import psycopg
from ldap3 import ALL, SUBTREE, Connection, Server

HOST = os.environ.get("LDAP_SERVER_HOST", "vpn-ldap")
PORT = int(os.environ.get("LDAP_SERVER_PORT", "389"))
BASE = os.environ.get("LDAP_SEARCH_BASE", "DC=ckk-tools,DC=loc")
BIND_DN = os.environ.get("LDAP_APP_DN", "")
BIND_PW = os.environ.get("LDAP_APP_PASSWORD", "")

_WS = re.compile(r"\s+")


def _norm(s: str | None) -> str:
    """Normalize for comparison: NFKC (half-width katakana -> full-width, etc.)
    then strip all whitespace (incl. full-width U+3000)."""
    return _WS.sub("", unicodedata.normalize("NFKC", (s or "").strip()))


def _ad_users() -> list[dict]:
    if not BIND_DN or not BIND_PW:
        raise SystemExit("LDAP_APP_DN / LDAP_APP_PASSWORD not configured")
    srv = Server(HOST, port=PORT, get_info=ALL, connect_timeout=10)
    conn = Connection(srv, user=BIND_DN, password=BIND_PW, auto_bind=True, receive_timeout=25)
    try:
        conn.search(
            BASE,
            "(&(objectClass=user)(objectCategory=person)(sAMAccountName=*))",
            search_scope=SUBTREE,
            attributes=["sAMAccountName", "displayName", "cn", "sn", "givenName"],
            paged_size=500,
        )
        out = []
        for e in conn.entries:
            sam = str(e.sAMAccountName) if e.sAMAccountName else ""
            if not sam:
                continue
            sn = str(e.sn) if e.sn else ""
            given = str(e.givenName) if e.givenName else ""
            # Candidate normalized name forms this user could be matched on.
            cands = {
                _norm(str(e.displayName) if e.displayName else ""),
                _norm(str(e.cn) if e.cn else ""),
                _norm(sn) + _norm(given),
                _norm(given) + _norm(sn),
            }
            out.append({
                "username": sam,
                "display": str(e.displayName) if e.displayName else (str(e.cn) if e.cn else sam),
                "cands": {c for c in cands if c},
            })
        return out
    finally:
        conn.unbind()


def _match_one(kot_name: str, ad_users: list[dict]) -> list[dict]:
    """AD users whose name matches this KOT name. Exact-equal preferred; if none,
    fall back to substring (handles composite displayName like '… - 山田 太郎')."""
    nk = _norm(kot_name)
    if not nk:
        return []
    exact = [u for u in ad_users if nk in u["cands"]]
    if exact:
        return exact
    return [u for u in ad_users if any(nk in c or c in nk for c in u["cands"])]


def main() -> int:
    apply = "--dry-run" not in sys.argv
    kot_url = os.environ.get("KOT_DB_URL", "").strip()
    if not kot_url:
        raise SystemExit("KOT_DB_URL not set")

    ad_users = _ad_users()
    print(f"AD users: {len(ad_users)}")

    with psycopg.connect(kot_url, connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute("SELECT employee_code, name FROM kot_employees ORDER BY employee_code")
        roster = cur.fetchall()
        print(f"KOT roster: {len(roster)}")
        if not roster:
            print("kot_employees is empty — run a KOT import first.")
            return 0

        cur.execute("SELECT employee_code FROM employees")
        already = {r[0] for r in cur.fetchall()}

        cur.execute(
            "CREATE TABLE IF NOT EXISTS kot_match_review ("
            "employee_code integer PRIMARY KEY, kot_name text NOT NULL, "
            "status text NOT NULL, candidates jsonb NOT NULL DEFAULT '[]', "
            "updated_at timestamptz NOT NULL DEFAULT now())"
        )

        confident = ambiguous = none = skipped = 0
        for code, name in roster:
            if code in already:
                skipped += 1
                continue
            matches = _match_one(name, ad_users)
            cands = [{"username": m["username"], "display": m["display"]} for m in matches]
            if len(matches) == 1:
                confident += 1
                if apply:
                    cur.execute(
                        "INSERT INTO employees (employee_code, username) VALUES (%s, %s) "
                        "ON CONFLICT (employee_code) DO UPDATE SET username = EXCLUDED.username",
                        (code, matches[0]["username"]),
                    )
                status = "auto"
            elif matches:
                ambiguous += 1
                status = "ambiguous"
            else:
                none += 1
                status = "unmatched"
            if apply:
                cur.execute(
                    "INSERT INTO kot_match_review (employee_code, kot_name, status, candidates) "
                    "VALUES (%s, %s, %s, %s) ON CONFLICT (employee_code) DO UPDATE SET "
                    "kot_name = EXCLUDED.kot_name, status = EXCLUDED.status, "
                    "candidates = EXCLUDED.candidates, updated_at = now()",
                    (code, name, status, json.dumps(cands, ensure_ascii=False)),
                )
        if apply:
            conn.commit()

        print(f"already mapped: {skipped}")
        print(f"confident (1 match){' -> written' if apply else ''}: {confident}")
        print(f"ambiguous (>1 match) -> review: {ambiguous}")
        print(f"unmatched (0 match) -> review: {none}")
        print("review rows in kot_match_review (status ambiguous|unmatched)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
