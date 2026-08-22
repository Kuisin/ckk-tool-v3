#!/usr/bin/env python3
"""Metabase MCP server (read-only: labor + CKK business data).

Exposes two read-only data sources to MCP clients (Open WebUI via mcpo):
  - King of Time attendance/labor data (Metabase db METABASE_DB_ID, default 2)
  - CKK 業務 business data (Metabase db METABASE_BUSINESS_DB_ID, default 5) —
    queried through the `analytics` views, which pre-join masters and expose
    human-readable text names instead of raw ID columns.

Queries run through Metabase's /api/dataset against read-only DB roles
(kot_ro / metabase_ro), so nothing can write and sensitive columns
(password hashes, kiosk tokens/PINs, push subscriptions) are masked at the
DB layer. Auth is a Metabase API key.

NOTE: Metabase's site-url is https://bi.ckk-tool.co.jp and it 307-redirects
API calls that arrive on the LAN URL; urllib does not follow 307 POSTs, so
METABASE_URL must be the https URL. Cloudflare in front of it rejects the
default python-urllib User-Agent, hence the explicit UA header.

Run standalone (stdio):   python server.py
Run via mcpo (OpenAPI):   mcpo --port 8000 -- python server.py
"""
import json
import os
import urllib.error
import urllib.request

from mcp.server.fastmcp import FastMCP

MB_URL = os.environ.get("METABASE_URL", "https://bi.ckk-tool.co.jp").rstrip("/")
API_KEY = os.environ.get("METABASE_API_KEY", "")
LABOR_DB_ID = int(os.environ.get("METABASE_DB_ID", "2") or "2")
BUSINESS_DB_ID = int(os.environ.get("METABASE_BUSINESS_DB_ID", "5") or "5")
ROW_LIMIT = int(os.environ.get("MCP_ROW_LIMIT", "200") or "200")
USER_AGENT = "Mozilla/5.0 (compatible; ckk-metabase-mcp/1.0)"

mcp = FastMCP("metabase-data")

LABOR_SCHEMA_DOC = """\
Labor database (King of Time attendance, PostgreSQL via Metabase). Use the EXACT
names below. Time columns are MINUTES unless the name ends in _hours. Prefer v_labor.

VIEW v_labor  -- one row per employee per day (use for most questions)
  date, username, employee_name (Japanese full name), employee_code,
  department, position (役職: 係長/課長/部長… — NULL = regular staff, non-NULL = manager/leader),
  company, is_active,
  work_minutes / work_hours, overtime_minutes / overtime_hours,
  overtime_night_minutes, night_allowance_minutes, leave_late_minutes,
  pto_minutes / pto_hours, clock_in_count, plan_start, plan_end
TABLE hr_records         -- raw daily rows
TABLE employees          -- employee_code -> username
TABLE kot_employees      -- employee_code -> name
TABLE employee_directory -- AD-synced org info: username, display_name, department, title, company, is_active, employee_code

-- "managers" = rows where position IS NOT NULL; group by department for org rollups.

Data spans 2024-01-05 onward. Examples:
  SELECT employee_name, ROUND(SUM(work_minutes)/60.0,1) AS hours
  FROM v_labor GROUP BY employee_name ORDER BY hours DESC LIMIT 5
  SELECT date, ROUND(SUM(work_minutes)/60.0,1) FROM v_labor
  WHERE date >= '2026-06-01' GROUP BY date ORDER BY date
"""

BUSINESS_SCHEMA_HEADER = """\
CKK 業務 database (manufacturing business system, PostgreSQL via Metabase).
Covers sales (見積/注文請書/注文明細), production (指示書/工程), purchasing,
shipping (出荷書/納品書), billing (請求書), inventory, and master data
(取引先/製品/素材/拠点).

ALWAYS query the analytics views listed below (bare view names — no schema
prefix needed). They pre-join master tables and expose readable text columns
(customer_name, product_name, sales_staff, …) instead of raw ID columns.

Conventions:
- Document numbers: 注文請書 ORD-YYYYMM-NNNNN (order lines add -NN), 指示書
  doc WOR-… (lot/work_order_number is a plain serial int), 出荷書 DOR-…,
  納品書 DRN-…, 請求書 INV-…. Views expose them as text (order_no,
  order_line_no / order_line_nos, …).
- Money: amounts are in the document's currency (`currency` column, default
  JPY); converted columns `*_jpy` / `*_usd` exist on money views.
- Localized {ja,en} master names are already resolved to text in the views.
- Status columns are enum text (DRAFT/CONFIRMED/…); dates are DATE/timestamp.
- Read-only role: some sensitive tables/columns are masked and will error.

Views (column lists follow):
"""

_business_schema_cache: str | None = None


def _dataset(sql: str, db_id: int) -> dict:
    req = urllib.request.Request(
        MB_URL + "/api/dataset",
        data=json.dumps({"type": "native", "native": {"query": sql}, "database": db_id}).encode(),
        headers={
            "Content-Type": "application/json",
            "x-api-key": API_KEY,
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def _run_select(sql: str, db_id: int) -> str:
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
        result = _dataset(statement, db_id)
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


@mcp.tool()
def get_labor_schema() -> str:
    """Return the labor (勤怠) database tables/views and columns (with units).
    Call this before writing SQL so you use correct names."""
    return LABOR_SCHEMA_DOC


@mcp.tool()
def query_labor_data(sql: str) -> str:
    """Run a read-only PostgreSQL SELECT against the King of Time labor (勤怠)
    database and return rows as a markdown table. Use the EXACT names below.

    Schema (PostgreSQL; prefer the view v_labor):
      v_labor(date, username, employee_name, employee_code,
              department, position, company, is_active,
              work_minutes, work_hours, overtime_minutes, overtime_hours,
              overtime_night_minutes, night_allowance_minutes, leave_late_minutes,
              pto_minutes, pto_hours, clock_in_count, plan_start, plan_end)
      -- one row per employee per day. *_minutes are minutes, *_hours are hours.
      -- Label people by employee_name. The date column is named `date`.
      -- position = 役職 (係長/課長/部長…): NULL = regular staff, non-NULL = manager/leader.
      -- group by department for org rollups.
      -- There is NO employee_id / first_name / last_name / work_date / hours_worked / manager_id.
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
    return _run_select(sql, LABOR_DB_ID)


@mcp.tool()
def get_business_schema() -> str:
    """Return the CKK 業務 (business) database views and their columns — orders,
    production work orders, shipping, invoices, inventory, and masters. ALWAYS
    call this before writing business SQL so you use correct view/column names."""
    global _business_schema_cache
    if _business_schema_cache is None:
        listing = _run_select(
            "SELECT table_name AS view, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns "
            "FROM information_schema.columns WHERE table_schema = 'analytics' "
            "GROUP BY table_name ORDER BY table_name",
            BUSINESS_DB_ID,
        )
        if listing.startswith(("Error", "Query", "SQL error")):
            # Don't cache failures — return the header plus the error so the
            # model knows the live listing is unavailable right now.
            return BUSINESS_SCHEMA_HEADER + "\n" + listing
        _business_schema_cache = BUSINESS_SCHEMA_HEADER + "\n" + listing
    return _business_schema_cache


@mcp.tool()
def query_business_data(sql: str) -> str:
    """Run a read-only PostgreSQL SELECT against the CKK 業務 (business)
    database — sales orders, production work orders, shipping, invoices,
    inventory, business partners, products — and return rows as a markdown
    table.

    ALWAYS call get_business_schema first and query the analytics views it
    lists (v_order_lines, v_work_orders, v_business_partners, v_products,
    v_invoices, v_product_inventory, …) by bare name. The views expose
    readable text columns (customer_name, product_name, status, order_no) —
    do NOT guess table names or join raw tables.

    Examples:
      -- order lines with customer and amount
      SELECT order_line_no, customer_name, product_name, quantity, amount, status
      FROM v_order_lines ORDER BY order_line_no DESC LIMIT 20
      -- work orders in progress
      SELECT work_order_number, product_name, planned_quantity, status
      FROM v_work_orders WHERE status = 'IN_PROGRESS'

    sql: a single read-only SELECT or WITH...SELECT statement (no ';', no
    INSERT/UPDATE/DELETE/DDL).
    """
    return _run_select(sql, BUSINESS_DB_ID)


if __name__ == "__main__":
    mcp.run()
