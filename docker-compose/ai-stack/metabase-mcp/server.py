#!/usr/bin/env python3
"""Metabase MCP server (read-only, scoped to the labor data source).

Exposes the King of Time attendance/labor data to MCP clients (Open WebUI via
mcpo). Queries run through Metabase's /api/dataset against the read-only labor
data source, so nothing can write. Auth is a Metabase API key scoped to the
"AI Labor RO" group.

Run standalone (stdio):   python server.py
Run via mcpo (OpenAPI):   mcpo --port 8000 -- python server.py
"""
import json
import os
import re
import urllib.error
import urllib.request

from mcp.server.fastmcp import FastMCP

MB_URL = os.environ.get("METABASE_URL", "http://192.168.50.15:3003").rstrip("/")
API_KEY = os.environ.get("METABASE_API_KEY", "")
DB_ID = int(os.environ.get("METABASE_DB_ID", "2") or "2")
ROW_LIMIT = int(os.environ.get("MCP_ROW_LIMIT", "200") or "200")

mcp = FastMCP("metabase-labor")

SCHEMA_DOC = """\
Labor database (King of Time attendance, PostgreSQL via Metabase). Use the EXACT
names below. Time columns are MINUTES unless the name ends in _hours. Prefer v_labor.

VIEW v_labor  -- one row per employee per day (use for most questions)
  date, username, employee_name (Japanese full name), employee_code,
  work_minutes / work_hours, overtime_minutes / overtime_hours,
  overtime_night_minutes, night_allowance_minutes, leave_late_minutes,
  pto_minutes / pto_hours, clock_in_count, plan_start, plan_end
TABLE hr_records   -- raw daily rows
TABLE employees    -- employee_code -> username
TABLE kot_employees-- employee_code -> name

Data spans 2024-01-05 onward. Examples:
  SELECT employee_name, ROUND(SUM(work_minutes)/60.0,1) AS hours
  FROM v_labor GROUP BY employee_name ORDER BY hours DESC LIMIT 5
  SELECT date, ROUND(SUM(work_minutes)/60.0,1) FROM v_labor
  WHERE date >= '2026-06-01' GROUP BY date ORDER BY date
"""


def _dataset(sql: str) -> dict:
    req = urllib.request.Request(
        MB_URL + "/api/dataset",
        data=json.dumps({"type": "native", "native": {"query": sql}, "database": DB_ID}).encode(),
        headers={"Content-Type": "application/json", "x-api-key": API_KEY},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


@mcp.tool()
def get_labor_schema() -> str:
    """Return the labor database tables/views and columns (with units). Call this
    before writing SQL so you use correct names."""
    return SCHEMA_DOC


@mcp.tool()
def query_labor_data(sql: str) -> str:
    """Run a read-only PostgreSQL SELECT against the King of Time labor (勤怠)
    database and return rows as a markdown table. Use the EXACT names below.

    Schema (PostgreSQL; prefer the view v_labor):
      v_labor(date, username, employee_name, employee_code,
              work_minutes, work_hours, overtime_minutes, overtime_hours,
              overtime_night_minutes, night_allowance_minutes, leave_late_minutes,
              pto_minutes, pto_hours, clock_in_count, plan_start, plan_end)
      -- one row per employee per day. *_minutes are minutes, *_hours are hours.
      -- Label people by employee_name. The date column is named `date`.
      -- There is NO employee_id / first_name / last_name / work_date / hours_worked.
    Examples:
      -- most-worked employee last week
      SELECT employee_name, ROUND(SUM(work_minutes)/60.0,1) AS hours
      FROM v_labor
      WHERE date >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 day'
        AND date <  date_trunc('week', CURRENT_DATE)
      GROUP BY employee_name ORDER BY hours DESC LIMIT 1
      -- monthly total hours by employee
      SELECT employee_name, ROUND(SUM(work_minutes)/60.0,1) AS hours
      FROM v_labor WHERE date >= '2026-06-01' AND date < '2026-07-01'
      GROUP BY employee_name ORDER BY hours DESC

    sql: a single read-only SELECT or WITH...SELECT statement (no ';', no
    INSERT/UPDATE/DELETE/DDL).
    """
    statement = (sql or "").strip().rstrip(";").strip()
    if not statement:
        return "Error: empty query."
    if ";" in statement:
        return "Error: only a single statement is allowed (no ';')."
    if not statement.lstrip("(").lower().startswith(("select", "with")):
        return "Error: only read-only SELECT / WITH queries are allowed."
    if not API_KEY:
        return "Error: METABASE_API_KEY is not configured."
    try:
        result = _dataset(statement)
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
    limited = rows[:ROW_LIMIT]
    out = ["| " + " | ".join(map(str, cols)) + " |",
           "| " + " | ".join("---" for _ in cols) + " |"]
    for row in limited:
        out.append("| " + " | ".join("" if c is None else str(c) for c in row) + " |")
    if len(rows) > len(limited):
        out.append(f"\n_(showing {len(limited)} of {len(rows)} rows)_")
    return "\n".join(out)


if __name__ == "__main__":
    mcp.run()
