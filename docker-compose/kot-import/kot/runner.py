#!/usr/bin/env python3
"""Run the King of Time export + DB load once, recording the outcome to the
`import_runs` table so adminTools can show the import log."""
import os
import sys
import traceback

import psycopg2

import db
import export_daily_csv

_DDL = """
CREATE TABLE IF NOT EXISTS import_runs (
    id bigserial PRIMARY KEY,
    finished_at timestamptz NOT NULL DEFAULT now(),
    start_date date, end_date date, days integer,
    rows integer, status text, message text
)
"""


def _conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def _ensure_table():
    try:
        c = _conn()
        with c, c.cursor() as cur:
            cur.execute(_DDL)
        c.close()
    except Exception as e:  # noqa: BLE001
        print(f"[runner] could not ensure import_runs: {e}")


def _record(status, sd, ed, days, rows, message):
    try:
        c = _conn()
        with c, c.cursor() as cur:
            cur.execute(
                "INSERT INTO import_runs (start_date, end_date, days, rows, status, message) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (sd, ed, days, rows, status, (message or "")[:2000]),
            )
        c.close()
    except Exception as e:  # noqa: BLE001
        print(f"[runner] could not record run: {e}")


def main() -> int:
    _ensure_table()
    days = int(os.environ.get("KOT_DAYS", "7"))
    sd, ed = export_daily_csv._resolve_date_range(None, None, days)
    try:
        path = export_daily_csv.run(headless=True, days=days)
        rows = db.write_to_db(path)
        _record("ok", sd, ed, days, rows, f"upserted {rows} rows")
        print(f"[runner] ok: {rows} rows")
        return 0
    except Exception as e:  # noqa: BLE001
        _record("failed", sd, ed, days, 0, str(e))
        print(f"[runner] failed: {e}")
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
