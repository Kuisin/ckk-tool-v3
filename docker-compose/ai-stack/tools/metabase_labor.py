"""
title: Labor Data (Metabase)
author: ckk-tool
version: 0.1.0
description: Ask questions about King of Time attendance/labor data in natural
  language. The model writes SQL; this tool runs it (read-only) through Metabase's
  API against the labor data source and returns the rows.
required_open_webui_version: 0.4.0
"""

# How it works
# ------------
# Two functions are exposed to the model:
#   - get_labor_schema(): returns the tables/columns it may query.
#   - query_labor_data(sql): runs a read-only SELECT via Metabase /api/dataset.
#
# Safety: the Metabase data source uses a read-only Postgres role (kot_ro) and the
# API key is scoped to that source, so writes are rejected at the DB. This tool
# additionally refuses anything that is not a single SELECT/WITH statement.
#
# Config comes from the open-webui container env (set in docker-compose via .env):
#   METABASE_URL, METABASE_DB_ID, METABASE_API_KEY
# They can be overridden per-tool in the Valves UI.

import json
import os
import urllib.request
import urllib.error

from pydantic import BaseModel, Field

SCHEMA_DOC = """\
Labor database (PostgreSQL). Query these objects. Time columns are in MINUTES
unless the column name ends in _hours. Prefer the v_labor view.

VIEW v_labor  -- one row per employee per day (use this for most questions)
  date                     date
  username                 text   -- AD login (e.g. 'r.horiike')
  employee_name            text   -- Japanese full name (e.g. '堀池 昇生')
  employee_code            int    -- King of Time code
  work_minutes / work_hours        -- actual worked time (実労働時間)
  overtime_minutes / overtime_hours-- normal overtime (普通残業)
  overtime_night_minutes           -- 深夜残業
  night_allowance_minutes          -- 深夜手当
  leave_late_minutes               -- 遅早欠時間
  pto_minutes / pto_hours          -- paid leave (有休)
  clock_in_count           int     -- number of clock-ins that day
  plan_start, plan_end             -- scheduled times
  record_starts[], record_ends[]   -- actual clock in/out timestamps

TABLE hr_records   -- raw daily rows (v_labor is built from this)
TABLE employees    -- employee_code -> username mapping
TABLE kot_employees-- employee_code -> name (KOT roster)

Notes:
- To total hours, SUM(work_minutes)/60.0 and ROUND(...,1).
- Group/label people by employee_name.
- Dates available are recent; use MAX(date) if unsure of the latest day.
"""


class Tools:
    class Valves(BaseModel):
        metabase_url: str = Field(
            default=os.getenv("METABASE_URL", "http://192.168.50.15:3003"),
            description="Base URL of the Metabase server.",
        )
        api_key: str = Field(
            default=os.getenv("METABASE_API_KEY", ""),
            description="Metabase API key (x-api-key) scoped to the read-only labor source.",
        )
        database_id: int = Field(
            default=int(os.getenv("METABASE_DB_ID", "2") or "2"),
            description="Metabase database id of the labor data source.",
        )
        row_limit: int = Field(
            default=200, description="Max rows to return to the model."
        )

    def __init__(self):
        self.valves = self.Valves()

    def get_labor_schema(self) -> str:
        """Return the tables, views and columns available in the labor database.
        Call this before writing SQL so you use correct column names and units."""
        return SCHEMA_DOC

    def query_labor_data(self, sql: str) -> str:
        """Run a read-only PostgreSQL SELECT against the labor database (King of
        Time attendance) and return the result rows.

        :param sql: A single read-only SELECT or WITH...SELECT statement. No
            semicolons, no INSERT/UPDATE/DELETE/DDL. See get_labor_schema() for the
            available tables/columns (prefer the v_labor view).
        :return: The result as a markdown table, or an error message.
        """
        v = self.valves
        if not v.api_key:
            return "Error: METABASE_API_KEY is not configured for this tool."

        statement = (sql or "").strip().rstrip(";").strip()
        if not statement:
            return "Error: empty query."
        if ";" in statement:
            return "Error: only a single statement is allowed (no ';')."
        head = statement.lstrip("(").lower()
        if not (head.startswith("select") or head.startswith("with")):
            return "Error: only read-only SELECT / WITH queries are allowed."

        payload = {
            "type": "native",
            "native": {"query": statement},
            "database": v.database_id,
        }
        req = urllib.request.Request(
            v.metabase_url.rstrip("/") + "/api/dataset",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "x-api-key": v.api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                result = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            return f"Query failed (HTTP {e.code}): {e.read().decode()[:300]}"
        except Exception as e:  # noqa: BLE001
            return f"Query error: {e}"

        data = result.get("data", {})
        if result.get("status") == "failed" or result.get("error"):
            return f"SQL error: {result.get('error', 'unknown')}"
        cols = [c.get("display_name") or c.get("name") for c in data.get("cols", [])]
        rows = data.get("rows", [])
        if not rows:
            return "Query ran successfully but returned no rows."

        limited = rows[: v.row_limit]
        out = ["| " + " | ".join(map(str, cols)) + " |",
               "| " + " | ".join("---" for _ in cols) + " |"]
        for row in limited:
            out.append("| " + " | ".join("" if c is None else str(c) for c in row) + " |")
        note = ""
        if len(rows) > len(limited):
            note = f"\n\n_(showing {len(limited)} of {len(rows)} rows)_"
        return "\n".join(out) + note
