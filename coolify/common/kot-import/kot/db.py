#!/usr/bin/env python3
"""
Write KOT daily CSV data into the hr_records table (PostgreSQL).
Expects the table to already exist. The kot schema is not Prisma-managed: new
columns are added by shared-db/sql/kot-columns.sql (run as postgres — role `kot`
does not own the table).
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

import secret_box

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


def get_kot_credentials() -> tuple[str, str]:
    """(kot_id, kot_pw) — a `kot_settings` row set via adminTools' 設定 modal wins
    (role `kot` has search_path=kot, so admintools writes the same unqualified
    table this reads); falls back to the KOT_ID/KOT_PW env vars when absent,
    undecryptable (wrong/missing CRED_ENCRYPTION_KEY), or the DB is unreachable —
    so an un-migrated deployment keeps working exactly as before."""
    try:
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM information_schema.tables WHERE table_name = 'kot_settings'"
                )
                if cur.fetchone() is not None:
                    cur.execute("SELECT kot_id_encrypted, kot_pw_encrypted FROM kot_settings WHERE id = 1")
                    row = cur.fetchone()
                    if row:
                        kot_id, kot_pw = secret_box.decrypt(row[0]), secret_box.decrypt(row[1])
                        if kot_id and kot_pw:
                            return kot_id, kot_pw
        finally:
            conn.close()
    except Exception as e:  # noqa: BLE001
        print(f"[kot] could not read kot_settings: {e}")
    return os.environ.get("KOT_ID", "").strip(), os.environ.get("KOT_PW", "").strip()


def _check_table(conn, table: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM information_schema.tables WHERE table_name = %s",
            (table,),
        )
        if cur.fetchone() is None:
            raise SystemExit(f"Table '{table}' does not exist. Run Prisma migrations first.")


def _record_roster(conn, rows: list[dict[str, str]]) -> int:
    """Upsert every (employee_code, name) seen in the CSV into kot_employees.

    Captures the full KOT roster (even people not yet mapped in `employees`) so
    the name-matcher has a durable source to seed the code->username map from.
    """
    roster: dict[int, str] = {}
    for row in rows:
        code_raw = row.get("従業員コード", "").strip()
        name = row.get("名前", "").strip()
        if not code_raw or not name:
            continue
        try:
            roster[int(code_raw)] = name
        except ValueError:
            continue
    if not roster:
        return 0
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS kot_employees ("
            "employee_code integer PRIMARY KEY, name text NOT NULL, "
            "last_seen_at timestamptz NOT NULL DEFAULT now())"
        )
        for code, name in roster.items():
            cur.execute(
                "INSERT INTO kot_employees (employee_code, name) VALUES (%s, %s) "
                "ON CONFLICT (employee_code) DO UPDATE SET name = EXCLUDED.name, "
                "last_seen_at = now()",
                (code, name),
            )
    conn.commit()
    return len(roster)


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


# CSV header → value. Every field is looked up BY HEADER NAME, never by column
# position, so KOT can add / reorder columns in the export layout without breaking
# the import. A field lists its accepted headers in preference order: the current
# layout (auto_import_v2, "カ）" prefix) first, then the legacy layout (auto_import).
# Add a new export column = add one line here + one column in kot-columns.sql.
H_CODE = ("従業員コード",)
H_NAME = ("名前",)
H_DATE = ("日時（曜日なし）",)
H_PLAN_START = ("出勤予定時刻",)
H_PLAN_END = ("退勤予定時刻",)
H_REC_START = ("出勤時刻",)
H_REC_END = ("退勤時刻",)
H_REST_START = "休憩開始打刻"  # + 1..8
H_REST_END = "休憩終了打刻"

# (db column, headers, required). Required = a layout without ANY of the headers is
# rejected before the date range is deleted (a wrong layout used to parse as all-zero
# rows and overwrite good data). Optional = NULL when the header is absent, so
# "the layout had no such field" stays distinguishable from a real 0.
INT_FIELDS: list[tuple[str, tuple[str, ...], bool]] = [
    ("wt_normal", ("カ）実労働時間", "実労働時間"), True),
    ("wt_overtime", ("カ）普通残業", "普通残業"), True),
    ("wt_overtime_night", ("カ）深夜残業", "深夜残業"), True),
    ("wt_night", ("カ）深夜手当", "深夜手当"), True),
    ("wt_leave_late", ("カ）遅早欠時間", "遅早欠時間"), True),
    ("pto", ("カ）有休時間", "有休時間"), True),
    ("wt_scheduled", ("カ）所定内時間",), False),
    ("wt_holiday", ("カ）休日時間",), False),
    ("wt_holiday_night", ("カ）休日深夜",), False),
    ("absence_part", ("欠勤(パート)時間休取得時間",), False),
    ("absence_leave", ("欠勤(産休育休)時間休取得時間",), False),
]
TEXT_FIELDS: list[tuple[str, tuple[str, ...]]] = [
    ("shift_limit_start", ("勤務開始刻限",)),
    ("shift_limit_end", ("勤務終了刻限",)),
]


def _cell(row: dict[str, str], headers: tuple[str, ...]) -> str | None:
    """Value of the first header that exists in this CSV; None if none does."""
    for h in headers:
        if h in row:
            return (row[h] or "").strip()
    return None


def _check_headers(fieldnames: list[str] | None) -> None:
    """Fail loudly (before anything is deleted) when the export layout lacks a
    header we cannot do without."""
    have = set(fieldnames or [])
    missing: list[str] = []
    for group in (H_CODE, H_DATE, H_PLAN_START, H_REC_START):
        if not any(h in have for h in group):
            missing.append(group[0])
    for col, headers, required in INT_FIELDS:
        if required and not any(h in have for h in headers):
            missing.append(" / ".join(headers))
    if missing:
        raise RuntimeError(
            "KOT CSV is missing required column(s): "
            + ", ".join(missing)
            + f". Headers seen: {sorted(have)}. Is the export layout auto_import_v2?"
        )


def _build_row(
    row: dict[str, str],
    emp_map: dict[int, str],
    unmatched: dict[str, str],
) -> tuple[Any, ...] | None:
    """Convert one CSV row → values tuple for INSERT (order = INSERT_COLUMNS).
    Returns None to skip."""
    code_raw = _cell(row, H_CODE) or ""
    dt = _parse_date_as_dt(_cell(row, H_DATE) or "")
    if not code_raw or dt is None:
        return None

    plan_start = _parse_ts(_cell(row, H_PLAN_START) or "")
    plan_end = _parse_ts(_cell(row, H_PLAN_END) or "")
    record_starts = _parse_ts_list(_cell(row, H_REC_START) or "")
    record_ends = _parse_ts_list(_cell(row, H_REC_END) or "")

    # Skip off-days: no schedule and no actual attendance
    if plan_start is None and not record_starts:
        return None

    name = _cell(row, H_NAME) or ""
    try:
        code_int = int(code_raw)
    except ValueError:
        unmatched[code_raw] = name
        return None

    username = emp_map.get(code_int)
    if username is None:
        unmatched[code_raw] = name
        return None

    rest_starts = _collect_ts_array(row, H_REST_START)
    rest_ends = _collect_ts_array(row, H_REST_END)

    ints: list[int | None] = []
    for _col, headers, _required in INT_FIELDS:
        raw = _cell(row, headers)
        ints.append(None if raw is None else _parse_int(raw))
    texts: list[str | None] = []
    for _col, headers in TEXT_FIELDS:
        raw = _cell(row, headers)
        texts.append(None if raw is None else (raw or None))

    return (
        username,
        ZONE,
        dt,
        *ints,
        plan_start,
        plan_end,
        record_starts,
        record_ends,
        rest_starts,
        rest_ends,
        *texts,
    )


INSERT_COLUMNS = (
    ["employee_username", "zone", "date"]
    + [c for c, _h, _r in INT_FIELDS]
    + ["plan_start", "plan_end", "record_starts", "record_ends", "rest_starts", "rest_ends"]
    + [c for c, _h in TEXT_FIELDS]
)

INSERT_SQL = (
    f"INSERT INTO {TABLE} ({', '.join(INSERT_COLUMNS)}) "
    f"VALUES ({', '.join(['%s'] * len(INSERT_COLUMNS))})"
)


def load_csv(csv_path: Path) -> list[dict[str, str]]:
    raw = csv_path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = raw.decode("cp932")
        except UnicodeDecodeError:
            text = raw.decode("shift_jis", errors="replace")
    reader = csv.DictReader(text.strip().splitlines())
    rows = list(reader)
    _check_headers(reader.fieldnames)
    return rows


def write_to_db(csv_path: Path) -> int:
    rows = load_csv(csv_path)  # raises if a required header is missing
    if not rows:
        print("CSV is empty, nothing to write.")
        return 0

    conn = get_connection()
    try:
        _check_table(conn, TABLE)
        seen = _record_roster(conn, rows)
        print(f"Recorded {seen} employees in kot_employees roster.")
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
            dates.add(vals[2])  # date column (INSERT_COLUMNS[2])

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
