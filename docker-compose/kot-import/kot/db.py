#!/usr/bin/env python3
"""
Write KOT daily CSV data into the hr_records table (PostgreSQL).
Expects the table and Zone enum to already exist (managed by Prisma).
"""

from __future__ import annotations

import csv
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import psycopg2
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

ZONE = "JPN"
TABLE = "hr_records"

# KOT timestamps: "2026/02/23(月)08:00" → strip day-of-week in parens
_TS_RE = re.compile(r"^(\d{4}/\d{2}/\d{2})\([^)]*\)(\d{2}:\d{2})$")


def get_connection():
    dsn = os.environ.get("DATABASE_URL", "").strip()
    if not dsn:
        raise SystemExit("Set DATABASE_URL in bpo_kot/.env")
    return psycopg2.connect(dsn)


def _check_table(conn, table: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            (table,),
        )
        if cur.fetchone() is None:
            raise SystemExit(f"Table '{table}' does not exist. Run Prisma migrations first.")


def _load_employee_map(conn) -> dict[int, str]:
    """Return {employee_code: username} from the employees table."""
    _check_table(conn, "employees")
    with conn.cursor() as cur:
        cur.execute("SELECT employee_code, username FROM employees")
        return {code: uname for code, uname in cur.fetchall()}


def _parse_ts(raw: str) -> datetime | None:
    raw = raw.strip()
    if not raw:
        return None
    m = _TS_RE.match(raw)
    if m:
        return datetime.strptime(f"{m.group(1)} {m.group(2)}", "%Y/%m/%d %H:%M")
    try:
        return datetime.strptime(raw, "%Y/%m/%d %H:%M")
    except ValueError:
        return None


def _parse_int(raw: str, default: int = 0) -> int:
    raw = raw.strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _parse_date_as_dt(raw: str) -> datetime | None:
    raw = raw.strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y/%m/%d")
    except ValueError:
        return None


def _parse_ts_list(raw: str) -> list[datetime]:
    """Parse a field that may contain multiple space-separated timestamps."""
    raw = raw.strip()
    if not raw:
        return []
    parts = re.split(r"\s+", raw)
    result = []
    for part in parts:
        ts = _parse_ts(part)
        if ts is not None:
            result.append(ts)
    return result


def _collect_ts_array(row: dict[str, str], prefix: str, count: int = 8) -> list[datetime]:
    result = []
    for i in range(1, count + 1):
        ts = _parse_ts(row.get(f"{prefix}{i}", ""))
        if ts is not None:
            result.append(ts)
    return result


def _build_row(
    row: dict[str, str],
    emp_map: dict[int, str],
    unmatched: dict[str, str],
) -> tuple[Any, ...] | None:
    """Convert one CSV row → values tuple for INSERT. Returns None to skip."""
    code_raw = row.get("従業員コード", "").strip()
    dt = _parse_date_as_dt(row.get("日時（曜日なし）", ""))
    if not code_raw or dt is None:
        return None

    plan_start = _parse_ts(row.get("出勤予定時刻", ""))
    plan_end = _parse_ts(row.get("退勤予定時刻", ""))
    record_starts = _parse_ts_list(row.get("出勤時刻", ""))
    record_ends = _parse_ts_list(row.get("退勤時刻", ""))

    # Skip off-days: no schedule and no actual attendance
    if plan_start is None and not record_starts:
        return None

    try:
        code_int = int(code_raw)
    except ValueError:
        unmatched[code_raw] = row.get("名前", "").strip()
        return None

    username = emp_map.get(code_int)
    if username is None:
        unmatched[code_raw] = row.get("名前", "").strip()
        return None

    rest_starts = _collect_ts_array(row, "休憩開始打刻")
    rest_ends = _collect_ts_array(row, "休憩終了打刻")

    return (
        username,
        ZONE,
        dt,
        _parse_int(row.get("実労働時間", "")),
        _parse_int(row.get("普通残業", "")),
        _parse_int(row.get("深夜残業", "")),
        _parse_int(row.get("深夜手当", "")),
        _parse_int(row.get("遅早欠時間", "")),
        _parse_int(row.get("有休時間", "")),
        plan_start,
        plan_end,
        record_starts,
        record_ends,
        rest_starts,
        rest_ends,
    )


INSERT_SQL = f"""
INSERT INTO {TABLE}
    (employee_username, zone, date,
     wt_normal, wt_overtime, wt_overtime_night, wt_night, wt_leave_late, pto,
     plan_start, plan_end,
     record_starts, record_ends, rest_starts, rest_ends)
VALUES
    (%s, %s, %s,
     %s, %s, %s, %s, %s, %s,
     %s, %s,
     %s, %s, %s, %s)
"""


def load_csv(csv_path: Path) -> list[dict[str, str]]:
    raw = csv_path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("cp932")
        except UnicodeDecodeError:
            text = raw.decode("shift_jis", errors="replace")
    return list(csv.DictReader(text.strip().splitlines()))


def write_to_db(csv_path: Path) -> int:
    rows = load_csv(csv_path)
    if not rows:
        print("CSV is empty, nothing to write.")
        return 0

    conn = get_connection()
    try:
        _check_table(conn, TABLE)
        emp_map = _load_employee_map(conn)
        print(f"Loaded {len(emp_map)} employees from DB.")

        parsed = []
        dates = set()
        unmatched: dict[str, str] = {}
        for row in rows:
            vals = _build_row(row, emp_map, unmatched)
            if vals is None:
                continue
            parsed.append(vals)
            dates.add(vals[2])  # date column

        if unmatched:
            print(f"\n[ERROR] {len(unmatched)} employee(s) not found in DB:")
            for code, name in sorted(unmatched.items()):
                print(f"  employee_code={code}  name={name}")
            print()

        if not parsed:
            print("No matching attendance rows to write.")
            return 0

        min_date, max_date = min(dates), max(dates)

        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {TABLE} WHERE zone = %s AND date >= %s AND date <= %s",
                (ZONE, min_date, max_date),
            )
            deleted = cur.rowcount
            if deleted:
                print(f"Deleted {deleted} existing rows for date range.")

            for vals in parsed:
                cur.execute(INSERT_SQL, vals)

        conn.commit()
        print(f"Inserted {len(parsed)} rows into '{TABLE}'.")
        return len(parsed)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        csv_dir = SCRIPT_DIR / "downloads"
        csvs = sorted(csv_dir.glob("kot_daily_*.csv"))
        if not csvs:
            raise SystemExit("No CSV files found in downloads/")
        path = csvs[-1]
    else:
        path = Path(sys.argv[1])

    print(f"Writing {path} to database...")
    n = write_to_db(path)
    print(f"Done. {n} rows written.")
