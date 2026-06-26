"""Reconcile the DB's mail accounts to the Sakura control panel via Playwright,
reusing the vendored adduser/create_email logic (driven by DB instead of Excel)."""
from __future__ import annotations

import os
import threading
import time

from playwright.sync_api import sync_playwright

from .db import MailAccount, SessionLocal
from .sakura import adduser, create_email

LOGIN_URL = "https://secure.sakura.ad.jp/rs/cp/"

_lock = threading.Lock()
_state = {"running": False, "log": [], "started": None, "finished": None, "ok": None}


def get_state() -> dict:
    with _lock:
        return {**_state, "log": list(_state["log"])}


def _log(msg: str) -> None:
    with _lock:
        _state["log"].append(f"{time.strftime('%H:%M:%S')}  {msg}")
    print(msg, flush=True)


def _auto_login(page, sid: str, spw: str) -> None:
    """Log in to the Sakura RS control panel (domain/email + password, no 2FA)."""
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    time.sleep(2)
    di = page.get_by_label("ドメイン名、またはレンタルサーバーのメールアドレス")
    di.wait_for(state="visible", timeout=15000)
    di.fill(sid)
    page.get_by_label("パスワード", exact=True).fill(spw)
    page.get_by_role("button", name="ログイン").click()
    page.wait_for_load_state("networkidle", timeout=30000)
    time.sleep(2)


def _load_from_db():
    """Active accounts -> (UserRows, AliasRows). Alias when email local part != username."""
    with SessionLocal() as s:
        accts = s.query(MailAccount).filter(MailAccount.is_active.is_(True)).all()
    users, aliases = [], []
    for a in accts:
        users.append(adduser.UserRow(username=a.username, password=a.password, email=a.email))
        local, _, domain = (a.email or "").partition("@")
        if local and domain and local != a.username:
            aliases.append(create_email.AliasRow(username=a.username, local_part=local, domain=domain))
    return users, aliases


def _run(headless: bool, remove_not_on_list: bool) -> None:
    sid = os.environ.get("SAKURA_ID", "").strip()
    spw = os.environ.get("SAKURA_PW", "").strip()
    if not sid or not spw:
        _log("ERROR: SAKURA_ID / SAKURA_PW not set in .env — cannot sync.")
        return
    users, aliases = _load_from_db()
    _log(f"Loaded {len(users)} active account(s), {len(aliases)} alias(es) from DB.")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(locale="ja-JP", viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        _log("Logging in to Sakura control panel...")
        _auto_login(page, sid, spw)
        _log(f"Logged in (now at {page.url}).")

        page.goto(adduser.USER_LIST_URL, wait_until="load", timeout=60000)
        if remove_not_on_list:
            _log("Removing users not in the DB...")
            adduser.remove_users_not_on_list_on_page(page, {u.username for u in users})
        _log("Adding / updating users...")
        adduser.add_users_on_page(page, users, update_existing_password=True)

        _log("Syncing mail aliases...")
        page.goto(create_email.MAIL_ALIAS_LIST_URL, wait_until="load", timeout=60000)
        create_email.add_aliases_on_page(page, aliases, remove_not_on_list=remove_not_on_list)

        browser.close()
    _log("Sync complete.")


def start_sync(headless: bool = True, remove_not_on_list: bool = True) -> bool:
    with _lock:
        if _state["running"]:
            return False
        _state.update(running=True, log=[], started=time.strftime("%Y-%m-%d %H:%M:%S"),
                      finished=None, ok=None)

    def runner():
        ok = True
        try:
            _run(headless, remove_not_on_list)
        except Exception as e:  # noqa: BLE001
            ok = False
            _log(f"SYNC FAILED: {e}")
        finally:
            with _lock:
                _state.update(running=False, finished=time.strftime("%Y-%m-%d %H:%M:%S"), ok=ok)

    threading.Thread(target=runner, daemon=True).start()
    return True
