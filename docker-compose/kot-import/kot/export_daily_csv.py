#!/usr/bin/env python3
"""
KING OF TIME: Login at https://login.ta.kingoftime.jp/admin, navigate to daily
data export via UI clicks, set date range to latest 7 days, download CSV.
Credentials from bpo_kot/.env (KOT_ID, KOT_PW).
"""

from __future__ import annotations

import os
import time
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

from db import write_to_db

# Load .env from script directory
SCRIPT_DIR = Path(__file__).resolve().parent
load_dotenv(SCRIPT_DIR / ".env")

LOGIN_URL = "https://s2.ta.kingoftime.jp/admin"
# After login we may be on s2.ta.kingoftime.jp/admin/...; navigation is by clicks only
EXPORT_TYPE_LINK_ID = "select_export_type_link"
DAILY_EXPORT_BUTTON_ID = "button_2-1"
DATE_RANGE_BUTTON_ID = "action_02"  # 日付指定
EXPORT_SUBMIT_BUTTON_ID = "button_01"  # データ出力
PAGE_TITLE_DAILY_EXPORT = "日別データ出力"
DOWNLOADS_DIR = SCRIPT_DIR / "downloads"


def _load_credentials() -> tuple[str, str]:
    kot_id = os.environ.get("KOT_ID", "").strip()
    kot_pw = os.environ.get("KOT_PW", "").strip()
    if not kot_id or not kot_pw:
        raise SystemExit("Set KOT_ID and KOT_PW in bpo_kot/.env")
    return kot_id, kot_pw


def _resolve_date_range(
    start: date | None = None,
    end: date | None = None,
    days: int | None = None,
) -> tuple[date, date]:
    if start and end:
        return start, end
    if days is not None:
        end_d = end or date.today()
        return end_d - timedelta(days=days - 1), end_d
    end_d = end or date.today()
    return end_d - timedelta(days=6), end_d


def _format_date(d: date) -> str:
    return d.strftime("%Y/%m/%d")


def _login(page, kot_id: str, kot_pw: str) -> None:
    print("Opening login page...")
    page.goto(LOGIN_URL, wait_until="domcontentloaded")
    time.sleep(2)
    # Normal /admin login page has ID + password fields
    id_input = page.locator('input[type="text"]').first
    id_input.wait_for(state="visible", timeout=10000)
    print("Filling credentials...")
    id_input.fill(kot_id)
    pw_input = page.locator('input[type="password"]')
    pw_input.fill(kot_pw)
    # Submit via Enter (login forms on KOT don't always have a visible submit button)
    print("Submitting login...")
    pw_input.press("Enter")
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(3)
    print(f"Login done. Now at: {page.url}")


def _dismiss_welcome(page) -> None:
    """Wait for the top/welcome page, dismiss tutorial popup by clicking outside."""
    print("Waiting for welcome/top page...")
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(3)
    # Tutorial popup appears after login — click outside the modal to dismiss it
    # Try multiple times in case it takes a moment to appear
    for attempt in range(5):
        # Check for common overlay/backdrop elements
        overlay = page.locator(
            '.ui-widget-overlay, .modal-backdrop, '
            '[class*="overlay"], [class*="backdrop"], '
            '[class*="mask"], .introjs-overlay'
        )
        if overlay.count() > 0 and overlay.first.is_visible():
            print(f"Tutorial overlay detected (attempt {attempt + 1}), clicking outside...")
            overlay.first.click(force=True)
            time.sleep(1)
            continue
        # Also try pressing Escape to close any modal
        page.keyboard.press("Escape")
        time.sleep(1)
        # Click a neutral area (top-left corner of the page body)
        page.mouse.click(10, 10)
        time.sleep(1)
        # Check if the export link is now visible (menu is accessible)
        if page.locator(f"#{EXPORT_TYPE_LINK_ID}").count() > 0:
            break
    print(f"Welcome page ready. URL: {page.url}")


def _go_to_export_type(page) -> None:
    print("Going to export type selection...")
    link = page.locator(f"#{EXPORT_TYPE_LINK_ID}")
    link.wait_for(state="visible", timeout=15000)
    link.click()
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(1.5)
    print("Export type page loaded.")


def _go_to_daily_export(page) -> None:
    print("Opening daily data export form...")
    btn = page.locator(f"button#{DAILY_EXPORT_BUTTON_ID}")
    btn.wait_for(state="visible", timeout=10000)
    btn.click()
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(1.5)
    print("Daily export form loaded.")


def _fill_date_range_and_export(page, start: date, end: date) -> Path:
    print("Switching to date range (日付指定)...")
    date_btn = page.locator(f"#{DATE_RANGE_BUTTON_ID}")
    date_btn.wait_for(state="visible", timeout=10000)
    date_btn.click()
    page.wait_for_load_state("networkidle", timeout=15000)
    time.sleep(1.5)

    start_str = _format_date(start)
    end_str = _format_date(end)

    page.evaluate("""([startVal, endVal]) => {
        function setDateInput(id, val) {
            const el = document.getElementById(id);
            if (!el) return;
            const nativeSetter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, 'value'
            ).set;
            nativeSetter.call(el, val);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        setDateInput('export_date_picker', startVal);
        setDateInput('end_export_date_picker', endVal);
    }""", [start_str, end_str])
    time.sleep(1)
    print(f"Date inputs set: {start_str} – {end_str}")

    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = DOWNLOADS_DIR / f"kot_daily_{start_str.replace('/', '-')}_{end_str.replace('/', '-')}.csv"

    # Set select_3 to value "3" (UTF-8) before submitting
    select3 = page.locator("#select_3")
    if select3.count() > 0 and select3.is_visible():
        print("Setting select_3 to value 3 (UTF-8)...")
        select3.select_option(value="3")
        time.sleep(0.5)

    print(f"Exporting CSV ({start_str}–{end_str})...")
    page.locator("#button_01").click()
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(3)

    export_btn = page.locator('button:visible:has-text("データ出力")').first
    export_btn.wait_for(state="visible", timeout=30000)
    print("Clicking データ出力...")

    with page.expect_download(timeout=120000) as download_info:
        export_btn.scroll_into_view_if_needed()
        export_btn.click(force=True)
        time.sleep(2)
        # Warning dialog ("エラー勤務または未確定申請があります") may appear
        dialog_wrapper = page.locator('.htBlock-dialog_wrapper')
        if dialog_wrapper.count() > 0 and dialog_wrapper.is_visible():
            print("Warning dialog detected, clicking データ出力 to continue...")
            dialog_btn = page.locator('.htBlock-dialog_yes:visible')
            dialog_btn.wait_for(state="visible", timeout=10000)
            dialog_btn.click()
    download = download_info.value
    download.save_as(out_path)
    print(f"Download saved: {out_path}")

    # Load and print CSV summary (try UTF-8 first since we set select_3=3, then cp932 fallback)
    raw = out_path.read_bytes()
    try:
        csv_text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            csv_text = raw.decode("cp932")
        except UnicodeDecodeError:
            csv_text = raw.decode("shift_jis", errors="replace")
    lines = csv_text.strip().splitlines()
    print(f"CSV loaded: {len(lines)} lines (including header)")
    if lines:
        print(f"Header: {lines[0]}")
    return out_path


def run(
    headless: bool = False,
    start: date | None = None,
    end: date | None = None,
    days: int | None = None,
) -> Path:
    kot_id, kot_pw = _load_credentials()
    start_d, end_d = _resolve_date_range(start, end, days)
    print(f"Date range: {_format_date(start_d)} – {_format_date(end_d)}")

    with sync_playwright() as p:
        print("Launching browser (visible)...")
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()

        try:
            _login(page, kot_id, kot_pw)
            _dismiss_welcome(page)
            _go_to_export_type(page)
            _go_to_daily_export(page)
            out_path = _fill_date_range_and_export(page, start_d, end_d)
            return out_path
        finally:
            browser.close()

    raise RuntimeError("Unexpected exit")


def _parse_date_arg(value: str) -> date:
    return date.fromisoformat(value)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--headless", action="store_true", help="Run browser in headless mode (for cron)")
    parser.add_argument("--start", type=_parse_date_arg, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=_parse_date_arg, help="End date (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, help="Number of days back from today (or --end)")
    args = parser.parse_args()

    if args.start and args.end and args.days:
        parser.error("Use --start/--end or --days, not all three")

    result = run(headless=args.headless, start=args.start, end=args.end, days=args.days)
    print(f"Saved: {result}")
    print("Writing CSV data to database...")
    count = write_to_db(result)
    print(f"Database write complete. {count} rows upserted.")
