#!/usr/bin/env python3
"""metabase-demo-build.py — driven by metabase-demo-shots.sh (step 5).

Wires up a throwaway Metabase instance (already running, empty) against the
throwaway seeded Postgres (already running as `ckk-shots-db`, reachable from
the Metabase container as host `ckk-shots-db`): first-run admin, the two
demo data sources, JA labels (reusing coolify/common/metabase/sql/*-ja.sql
with the data-source name swapped), the 4 CKK業務 dashboards (via the real
build-business-dashboards.py, unmodified), and the 労務分析 dashboard (no
reusable builder exists for that one — built here as 4 native SQL cards
against kot.v_labor, mirroring the real dashboard's card names/columns).
"""
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request

DB_HOST = "ckk-shots-db"
MB_DB_CONTAINER = "ckk-shots-mb-db"
MB_CONTAINER = "ckk-shots-mb"
BIZ_DB_NAME = "CKK 業務（デモ）"
LABOR_DB_NAME = "労務分析（デモ）"


def api(mb_url, method, path, body=None, session=None, api_key=None):
    headers = {"Content-Type": "application/json"}
    if session:
        headers["X-Metabase-Session"] = session
    if api_key:
        headers["x-api-key"] = api_key
    req = urllib.request.Request(
        mb_url + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else {}


def psql(container, db, user, sql_path):
    with open(sql_path, "rb") as f:
        subprocess.run(
            ["docker", "exec", "-i", container, "psql", "-U", user, "-d", db, "-v", "ON_ERROR_STOP=1", "-q"],
            stdin=f, check=True,
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mb-url", required=True)
    ap.add_argument("--admin-email", required=True)
    ap.add_argument("--admin-password", required=True)
    ap.add_argument("--ja-business-sql", required=True)
    ap.add_argument("--ja-labor-sql", required=True)
    ap.add_argument("--builder-py", required=True)
    args = ap.parse_args()
    mb_url = args.mb_url.rstrip("/")

    print("[1/6] first-run setup")
    props = api(mb_url, "GET", "/api/session/properties")
    setup = api(mb_url, "POST", "/api/setup", {
        "token": props["setup-token"],
        "user": {"first_name": "Manual", "last_name": "Shots",
                  "email": args.admin_email, "password": args.admin_password,
                  "locale": "ja"},
        "prefs": {"site_name": "CKK Manual Shots", "allow_tracking": False},
    })
    session = setup["id"]
    # Production's bi.ckk-tool.co.jp has site-locale=ja (real users see a fully
    # Japanese UI, not just Japanese content) — match that here so the demo
    # screenshots are representative, not just Japanese-labeled data inside an
    # English chrome. Also set the admin account's own locale explicitly:
    # `user.locale` at /api/setup is best-effort in some Metabase versions.
    api(mb_url, "PUT", "/api/setting/site-locale", {"value": "ja"}, session=session)
    me = api(mb_url, "GET", "/api/user/current", session=session)
    api(mb_url, "PUT", f"/api/user/{me['id']}", {"locale": "ja"}, session=session)

    print("[2/6] data sources")
    biz_db = api(mb_url, "POST", "/api/database", {
        "engine": "postgres", "name": BIZ_DB_NAME,
        "details": {"host": DB_HOST, "port": 5432, "dbname": "ckk",
                     "user": "metabase_ro", "password": "localshots",
                     "schema-filters-type": "inclusion", "schema-filters-patterns": "app,analytics",
                     "ssl": False},
    }, session=session)
    labor_db = api(mb_url, "POST", "/api/database", {
        "engine": "postgres", "name": LABOR_DB_NAME,
        "details": {"host": DB_HOST, "port": 5432, "dbname": "ckk",
                     "user": "kot_ro", "password": "localshots",
                     "schema-filters-type": "inclusion", "schema-filters-patterns": "kot,directory",
                     "ssl": False},
    }, session=session)
    biz_id, labor_id = biz_db["id"], labor_db["id"]

    api(mb_url, "POST", f"/api/database/{biz_id}/sync_schema", session=session)
    api(mb_url, "POST", f"/api/database/{labor_id}/sync_schema", session=session)
    for _ in range(30):
        meta = api(mb_url, "GET", f"/api/database/{labor_id}/metadata", session=session)
        if any(t["name"] == "v_labor" for t in meta.get("tables", [])):
            break
        time.sleep(2)
    else:
        sys.exit("labor db did not sync in time")

    print("[3/6] JA labels")
    with open(args.ja_business_sql, encoding="utf-8") as f:
        biz_sql = f.read().replace("WHERE name = 'CKK 業務'", f"WHERE name = '{BIZ_DB_NAME}'")
    biz_sql_path = "/tmp/mb-demo-biz-ja.sql"
    open(biz_sql_path, "w", encoding="utf-8").write(biz_sql)
    psql(MB_DB_CONTAINER, "metabase", "metabase", biz_sql_path)

    with open(args.ja_labor_sql, encoding="utf-8") as f:
        labor_sql = f.read().replace("LIKE 'King of Time%'", f"= '{LABOR_DB_NAME}'")
    labor_sql_path = "/tmp/mb-demo-labor-ja.sql"
    open(labor_sql_path, "w", encoding="utf-8").write(labor_sql)
    psql(MB_DB_CONTAINER, "metabase", "metabase", labor_sql_path)

    print("[4/6] restart to clear label cache")
    subprocess.run(["docker", "restart", MB_CONTAINER], check=True)
    for _ in range(30):
        try:
            api(mb_url, "GET", "/api/health")
            break
        except Exception:
            time.sleep(3)
    session = api(mb_url, "POST", "/api/session",
                  {"username": args.admin_email, "password": args.admin_password})["id"]

    print("[5/6] CKK業務 dashboards (build-business-dashboards.py)")
    groups = api(mb_url, "GET", "/api/permissions/group", session=session)
    admin_group = next(g["id"] for g in groups if g["name"] == "Administrators")
    key_resp = api(mb_url, "POST", "/api/api-key",
                   {"group_id": admin_group, "name": "manual-shots-builder"}, session=session)
    api_key = key_resp["unmasked_key"]

    biz_coll = api(mb_url, "POST", "/api/collection", {"name": "CKK 業務", "color": "#509EE3"}, session=session)
    subprocess.run(
        [sys.executable, args.builder_py],
        check=True,
        env={"MB_URL": mb_url, "MB_API_KEY": api_key, "MB_DB_ID": str(biz_id),
             "MB_COLLECTION_ID": str(biz_coll["id"]), "PATH": "/usr/bin:/bin:/usr/local/bin"},
    )

    print("[6/6] 労務分析 dashboard (native SQL, no reusable builder)")
    labor_coll = api(mb_url, "POST", "/api/collection", {"name": "労務分析", "color": "#84BB4C"}, session=session)
    meta = api(mb_url, "GET", f"/api/database/{labor_id}/metadata", session=session)
    date_field = next(f["id"] for t in meta["tables"] if t["name"] == "v_labor"
                       for f in t["fields"] if f["name"] == "date")

    date_tag = {"date_range": {"id": "date_range", "name": "date_range", "display-name": "期間",
                                "type": "dimension", "dimension": ["field", date_field, None],
                                "widget-type": "date/all-options"}}
    cards_spec = [
        ("総労働時間（週次・部門別）", "line", date_tag, """
select department as "部署", date_trunc('week', date)::date as "日付: 週",
  sum(work_hours) as "実労働時間", sum(overtime_hours) as "残業時間",
  sum(work_hours + overtime_hours) as "総労働時間"
from kot.v_labor where 1=1 [[and {{date_range}}]] group by 1, 2 order by 2, 1"""),
        ("【工場別】労働時間（週次）", "line", date_tag, """
select company as "会社", date_trunc('week', date)::date as "日付: 週",
  sum(work_hours + overtime_hours) as "総労働時間"
from kot.v_labor where 1=1 [[and {{date_range}}]] group by 1, 2 order by 2, 1"""),
        ("残業時間の日次集計（今月）", "table", {}, """
select department as "部署", date as "日付: 日", employee_name as "氏名",
  sum(overtime_hours) as "残業時間"
from kot.v_labor where date >= date_trunc('month', current_date) group by 1, 2, 3 order by 1, 2"""),
        ("残業時間の月次合計（今月）", "table", {}, """
select company as "会社", department as "部署", sum(overtime_hours) as "残業時間"
from kot.v_labor where date >= date_trunc('month', current_date) group by 1, 2 order by 1, 2"""),
    ]
    ids = {}
    for name, display, tags, sql in cards_spec:
        card = api(mb_url, "POST", "/api/card", {
            "name": name, "collection_id": labor_coll["id"],
            "dataset_query": {"type": "native", "native": {"query": sql.strip(), "template-tags": tags},
                               "database": labor_id},
            "display": display, "visualization_settings": {},
        }, session=session)
        ids[name] = card["id"]

    dash = api(mb_url, "POST", "/api/dashboard", {"name": "労務分析", "collection_id": labor_coll["id"]}, session=session)
    param_id = "f9160707"
    param = {"id": param_id, "name": "期間", "slug": "date_range", "type": "date/all-options", "sectionId": "date"}
    layout = [
        (ids["総労働時間（週次・部門別）"], 0, 0, 24, 8, True),
        (ids["【工場別】労働時間（週次）"], 8, 0, 15, 9, True),
        (ids["残業時間の月次合計（今月）"], 8, 15, 9, 9, False),
        (ids["残業時間の日次集計（今月）"], 17, 0, 24, 14, False),
    ]
    dashcards = []
    for card_id, row, col, sx, sy, wired in layout:
        dc = {"id": -card_id, "card_id": card_id, "row": row, "col": col, "size_x": sx, "size_y": sy,
              "parameter_mappings": [], "visualization_settings": {}}
        if wired:
            dc["parameter_mappings"] = [{"parameter_id": param_id, "card_id": card_id,
                                          "target": ["dimension", ["template-tag", "date_range"]]}]
        dashcards.append(dc)
    api(mb_url, "PUT", f"/api/dashboard/{dash['id']}", {"parameters": [param], "dashcards": dashcards}, session=session)

    print(f"done: business dashboards in collection {biz_coll['id']}, labor dashboard {dash['id']}")


if __name__ == "__main__":
    main()
