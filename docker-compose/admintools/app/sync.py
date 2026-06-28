"""Reconcile the DB's mail accounts to the Sakura control panel via Playwright,
reusing the vendored adduser/create_email logic (driven by DB instead of Excel)."""
from __future__ import annotations

import os
import sys
import threading
import time
from contextlib import contextmanager

from playwright.sync_api import sync_playwright

from .db import DEFAULT_DOMAIN, MailAccount, SessionLocal
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


class LoginError(RuntimeError):
    pass


def _auto_login(page, sid: str, spw: str) -> None:
    """Log in to the Sakura RS control panel (domain/email + password, no 2FA).
    Raises LoginError if authentication fails (so callers fail fast, not hang)."""
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    time.sleep(2)
    di = page.get_by_label("ドメイン名、またはレンタルサーバーのメールアドレス")
    di.wait_for(state="visible", timeout=15000)
    di.fill(sid)
    page.get_by_label("パスワード", exact=True).fill(spw)
    page.get_by_role("button", name="ログイン").click()
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:  # noqa: BLE001
        pass
    time.sleep(2)
    # Verify success: a failed login keeps the form + shows 認証に失敗しました.
    body = ""
    try:
        body = page.inner_text("body")
    except Exception:  # noqa: BLE001
        pass
    if "認証に失敗" in body or "ログインできません" in body or "正しくありません" in body:
        raise LoginError("Sakura ログイン認証に失敗しました — SAKURA_ID / SAKURA_PW を確認してください。")
    if page.get_by_label("パスワード", exact=True).count() and page.get_by_role("button", name="ログイン").count():
        raise LoginError("Sakura ログインに失敗しました（ログイン画面のままです）— 認証情報を確認してください。")


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


def preview() -> dict:
    """Plan a sync from the DB alone (no Sakura login) — the 'check state' shown
    before syncing. Each active account becomes a mailbox (username@domain); when
    the account's email differs from username@domain it ALSO gets an alias (the
    friendly address routed to the mailbox)."""
    sid = os.environ.get("SAKURA_ID", "").strip()
    spw = os.environ.get("SAKURA_PW", "").strip()
    users, aliases = _load_from_db()
    return {
        "env_ok": bool(sid and spw),
        "domain": DEFAULT_DOMAIN,
        "user_count": len(users),
        "alias_count": len(aliases),
        # step 1: create/update the user mailbox
        "users": [{"username": u.username, "mailbox": f"{u.username}@{DEFAULT_DOMAIN}"} for u in users],
        # step 2: create the alias when username != email local part
        "aliases": [{"alias": f"{a.local_part}@{a.domain}", "to": f"{a.username}@{a.domain}"} for a in aliases],
    }


_check_lock = threading.Lock()
_check_cache: dict = {"ts": 0.0, "result": None}


def check_live(refresh: bool = False, max_age: float = 300.0) -> dict:
    """Read-only: log into Sakura, read current mailboxes + aliases, and diff them
    against the DB plan. Returns the real change plan (create / exists / delete).
    No add/remove is performed. Cached for max_age seconds."""
    with _check_lock:
        c = _check_cache
        if not refresh and c["result"] and time.time() - c["ts"] < max_age:
            return c["result"]
    sid = os.environ.get("SAKURA_ID", "").strip()
    spw = os.environ.get("SAKURA_PW", "").strip()
    if not sid or not spw:
        return {"env_ok": False, "error": "SAKURA_ID / SAKURA_PW not set"}
    if _state["running"]:
        return {"env_ok": True, "error": "同期の実行中です。完了後に再試行してください。"}

    users, aliases = _load_from_db()
    keep_users = {u.username for u in users}
    keep_aliases = {f"{a.local_part}@{a.domain}" for a in aliases}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(locale="ja-JP", viewport={"width": 1280, "height": 900}).new_page()
        _auto_login(page, sid, spw)
        page.goto(adduser.USER_LIST_URL, wait_until="load", timeout=60000)
        cur_users = adduser._collect_existing_usernames_from_all_pages(page, adduser.USER_LIST_URL)
        page.goto(create_email.MAIL_ALIAS_LIST_URL, wait_until="load", timeout=60000)
        cur_aliases = create_email._collect_existing_aliases(page, create_email.MAIL_ALIAS_LIST_URL)
        browser.close()

    result = {
        "env_ok": True,
        "checked_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "mailbox": {
            "create": sorted(keep_users - cur_users),
            "exists": sorted(keep_users & cur_users),
            "delete": sorted(cur_users - keep_users - {"postmaster"}),
        },
        "alias": {
            "create": sorted(keep_aliases - cur_aliases),
            "exists": sorted(keep_aliases & cur_aliases),
            "delete": sorted(cur_aliases - keep_aliases),
        },
    }
    with _check_lock:
        _check_cache.update(ts=time.time(), result=result)
    return result


_check_state = {"running": False, "result": None, "error": None, "ts": 0.0}


def start_check(refresh: bool = True) -> bool:
    """Run check_live in the background so the UI can poll instead of holding a
    ~45s request open (which proxies/browsers cut off). Returns False if already
    running."""
    with _check_lock:
        if _check_state["running"]:
            return False
        _check_state.update(running=True, error=None)

    def runner():
        try:
            r = check_live(refresh=refresh)
            upd = ({"running": False, "result": None, "error": r["error"], "ts": time.time()}
                   if r.get("error") else
                   {"running": False, "result": r, "error": None, "ts": time.time()})
        except Exception as e:  # noqa: BLE001
            upd = {"running": False, "result": None, "error": str(e)[:200], "ts": time.time()}
        with _check_lock:
            _check_state.update(upd)

    threading.Thread(target=runner, daemon=True).start()
    return True


def get_check_state() -> dict:
    with _check_lock:
        return dict(_check_state)


class _LogStream:
    """Pipe the Sakura helpers' per-item prints into the UI sync log, line by line,
    while still echoing to the real stdout (container logs)."""

    def __init__(self, real):
        self._real = real
        self._buf = ""

    def write(self, s):
        try:
            self._real.write(s)
        except Exception:  # noqa: BLE001
            pass
        self._buf += s
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            line = line.strip()
            if line:
                with _lock:
                    _state["log"].append(f"{time.strftime('%H:%M:%S')}    {line}")

    def flush(self):
        try:
            self._real.flush()
        except Exception:  # noqa: BLE001
            pass


@contextmanager
def _capture_to_log():
    old = sys.stdout
    sys.stdout = _LogStream(old)
    try:
        yield
    finally:
        sys.stdout = old


def _run(headless: bool, remove_not_on_list: bool) -> None:
    sid = os.environ.get("SAKURA_ID", "").strip()
    spw = os.environ.get("SAKURA_PW", "").strip()
    if not sid or not spw:
        _log("ERROR: SAKURA_ID / SAKURA_PW not set in .env — cannot sync.")
        return
    users, aliases = _load_from_db()
    steps = 4 if remove_not_on_list else 3
    _log("===== 同期開始 =====")
    _log(f"DB: 有効ユーザー {len(users)}件 / エイリアス {len(aliases)}件")
    if remove_not_on_list:
        _log("⚠ 削除モード ON: DB に無いメールボックス／エイリアスを削除します。")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_context(locale="ja-JP", viewport={"width": 1280, "height": 900}).new_page()

        _log(f"[1/{steps}] Sakura にログイン中…")
        _auto_login(page, sid, spw)
        _log(f"[1/{steps}] ✓ ログイン成功")

        page.goto(adduser.USER_LIST_URL, wait_until="load", timeout=60000)
        n = 1
        if remove_not_on_list:
            n += 1
            _log(f"[{n}/{steps}] DB に無いユーザーを削除中…")
            with _capture_to_log():
                adduser.remove_users_not_on_list_on_page(page, {u.username for u in users})
            _log(f"[{n}/{steps}] ✓ 削除処理 完了")

        n += 1
        _log(f"[{n}/{steps}] ユーザーを作成・更新中…（{len(users)}件）")
        with _capture_to_log():
            adduser.add_users_on_page(page, users, update_existing_password=True)
        _log(f"[{n}/{steps}] ✓ ユーザー処理 完了")

        n += 1
        _log(f"[{n}/{steps}] エイリアスを作成中…（{len(aliases)}件）")
        page.goto(create_email.MAIL_ALIAS_LIST_URL, wait_until="load", timeout=60000)
        with _capture_to_log():
            create_email.add_aliases_on_page(page, aliases, remove_not_on_list=remove_not_on_list)
        _log(f"[{n}/{steps}] ✓ エイリアス処理 完了")

        browser.close()
    _log("===== 同期完了 =====")


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
