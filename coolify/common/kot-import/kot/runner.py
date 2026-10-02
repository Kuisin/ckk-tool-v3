#!/usr/bin/env python3
"""Run the King of Time export + DB load once, recording the outcome to the
`import_runs` table so adminTools can show the import log."""
from __future__ import annotations

import os
import sys
import traceback
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

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

# Manual "force import" requests, written by adminTools (/kot). Both sides create the
# table if missing (role `kot` may CREATE in schema kot), so deploy order doesn't matter.
_REQ_DDL = """
CREATE TABLE IF NOT EXISTS import_requests (
    id bigserial PRIMARY KEY,
    start_date date NOT NULL, end_date date NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    requested_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz, finished_at timestamptz,
    rows integer, message text,
    source text NOT NULL DEFAULT 'manual'
)
"""
# Month-end cleanup: KOT keeps changing a day's numbers after the fact (late
# corrections, 申請 approvals), so once a month the whole closing window is re-read.
CLEANUP_SOURCE = "month-end"
CLEANUP_TZ = ZoneInfo("Asia/Tokyo")  # "last day of the month" is a Japan calendar day
# Failsafe: a missed month-end (container down all day) is caught up for this many days
# after it, and a failed reload is retried on later scheduled runs up to this many times.
CLEANUP_CATCHUP_DAYS = int(os.environ.get("KOT_CLEANUP_CATCHUP_DAYS", "7"))
CLEANUP_MAX_ATTEMPTS = int(os.environ.get("KOT_CLEANUP_MAX_ATTEMPTS", "3"))
# KOT's daily export caps how long one date range may be, so a long request is split
# into batches of this many calendar months (start day → same day N months later − 1).
# 2 months is at most 62 days (e.g. 7/1–8/31).
BATCH_MONTHS = 2


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


def month_end_window(today: date) -> tuple[date, date] | None:
    """On the last day of a month: (20th of the previous month, today). Else None."""
    if (today + timedelta(days=1)).day != 1:
        return None
    return _window_ending(today)


def _window_ending(month_end: date) -> tuple[date, date]:
    prev_month_last = month_end.replace(day=1) - timedelta(days=1)
    return prev_month_last.replace(day=20), month_end


def due_month_end_window(today: date) -> tuple[date, date] | None:
    """The month-end reload that should exist by now: this month's on its last day,
    otherwise last month's for CLEANUP_CATCHUP_DAYS after it — so a container that was
    down (or a KOT outage) on the last day still gets the reload once it is back."""
    if month_end_window(today):
        return month_end_window(today)
    last_month_end = today.replace(day=1) - timedelta(days=1)
    if (today - last_month_end).days <= CLEANUP_CATCHUP_DAYS:
        return _window_ending(last_month_end)
    return None


def queue_month_end_cleanup() -> bool:
    """Queue the due month-end reload unless it already succeeded, is queued/running,
    or has failed CLEANUP_MAX_ATTEMPTS times. Called by every scheduled run (6h), so a
    failed attempt is retried on the next run — never more than one in flight."""
    window = due_month_end_window(datetime.now(CLEANUP_TZ).date())
    if window is None:
        return False
    _ensure_request_table()
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                "SELECT status, count(*) FROM import_requests "
                "WHERE source = %s AND end_date = %s GROUP BY status",
                (CLEANUP_SOURCE, window[1]),
            )
            counts = dict(cur.fetchall())
            if counts.get("done") or counts.get("pending") or counts.get("running"):
                return False
            failed = counts.get("failed", 0)
            if failed >= CLEANUP_MAX_ATTEMPTS:
                print(f"[runner] month-end cleanup {window[1]} gave up after {failed} failures")
                return False
            cur.execute(
                "INSERT INTO import_requests (start_date, end_date, source) VALUES (%s, %s, %s)",
                (window[0], window[1], CLEANUP_SOURCE),
            )
        attempt = f" (retry {failed})" if failed else ""
        print(f"[runner] queued month-end cleanup {window[0]} – {window[1]}{attempt}")
        return True
    finally:
        c.close()


def _ensure_request_table():
    try:
        c = _conn()
        with c, c.cursor() as cur:
            cur.execute(_REQ_DDL)
            # tables created before `source` existed
            cur.execute("ALTER TABLE import_requests ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'")
        c.close()
    except Exception as e:  # noqa: BLE001
        print(f"[runner] could not ensure import_requests: {e}")


def _claim_request():
    """Take the oldest pending request (row lock, so two runners never share one)."""
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                "UPDATE import_requests SET status = 'running', started_at = now() "
                "WHERE id = (SELECT id FROM import_requests WHERE status = 'pending' "
                "ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) "
                "RETURNING id, start_date, end_date, source"
            )
            return cur.fetchone()
    finally:
        c.close()


def _finish_request(req_id, status, rows, message):
    c = _conn()
    try:
        with c, c.cursor() as cur:
            cur.execute(
                "UPDATE import_requests SET status = %s, rows = %s, message = %s, "
                "finished_at = now() WHERE id = %s",
                (status, rows, (message or "")[:2000], req_id),
            )
    finally:
        c.close()


def _add_months(d: date, months: int) -> date:
    """Same day `months` later, clamped to that month's last day (1/31 + 1 → 2/28)."""
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    last = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def _windows(start: date, end: date):
    """Split [start, end] into consecutive batches of BATCH_MONTHS calendar months."""
    cur = start
    while cur <= end:
        nxt = _add_months(cur, BATCH_MONTHS)
        yield cur, min(nxt - timedelta(days=1), end)
        cur = nxt


def run_pending() -> int:
    """Process every pending force-import request. Cheap when there is none — the
    entrypoint calls this every few seconds between scheduled runs."""
    _ensure_table()
    _ensure_request_table()
    handled = 0
    while True:
        req = _claim_request()
        if req is None:
            return handled
        req_id, sd, ed, source = req
        label = "month-end" if source == CLEANUP_SOURCE else "manual"
        handled += 1
        total = 0
        try:
            for a, b in _windows(sd, ed):
                path = export_daily_csv.run(headless=True, start=a, end=b)
                total += db.write_to_db(path)
            msg = f"{label} #{req_id}: upserted {total} rows"
            _record("ok", sd, ed, (ed - sd).days + 1, total, msg)
            _finish_request(req_id, "done", total, msg)
            print(f"[runner] request {req_id} ok: {total} rows")
        except Exception as e:  # noqa: BLE001
            msg = f"{label} #{req_id}: {e}"
            _record("failed", sd, ed, (ed - sd).days + 1, total, msg)
            _finish_request(req_id, "failed", total, str(e))
            print(f"[runner] request {req_id} failed: {e}")
            traceback.print_exc()


def _queue_cleanup_safely() -> None:
    try:
        queue_month_end_cleanup()
    except Exception as e:  # noqa: BLE001
        print(f"[runner] could not queue month-end cleanup: {e}")


def main() -> int:
    if "--pending" in sys.argv[1:]:
        run_pending()
        return 0
    _ensure_table()
    days = int(os.environ.get("KOT_DAYS", "7"))
    sd, ed = export_daily_csv._resolve_date_range(None, None, days)
    try:
        path = export_daily_csv.run(headless=True, days=days)
        rows = db.write_to_db(path)
        _record("ok", sd, ed, days, rows, f"upserted {rows} rows")
        print(f"[runner] ok: {rows} rows")
        _queue_cleanup_safely()
        return 0
    except Exception as e:  # noqa: BLE001
        _record("failed", sd, ed, days, 0, str(e))
        print(f"[runner] failed: {e}")
        traceback.print_exc()
        _queue_cleanup_safely()  # a failed routine run must not also skip the cleanup
        return 1


if __name__ == "__main__":
    sys.exit(main())
