#!/usr/bin/env python3
"""ldap-sync service: periodic full sync + HTTP trigger for login-driven syncs.

Endpoints (called by the bind-aware forwarder and for manual runs):
  GET  /health         -> ok
  POST /sync           -> full directory sync (async)
  POST /sync/<user>    -> sync a single user (async, debounced) — fired on login

A background thread re-runs full_sync() every LDAP_SYNC_INTERVAL_SECONDS so the
directory stays fresh even without logins.
"""
from __future__ import annotations

import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sync

INTERVAL = int(os.environ.get("LDAP_SYNC_INTERVAL_SECONDS", "21600"))  # 6h
PORT = int(os.environ.get("SYNC_HTTP_PORT", "8088"))
USER_DEBOUNCE = int(os.environ.get("LDAP_SYNC_USER_DEBOUNCE_SECONDS", "300"))  # 5m
# Collapse login storms: at most one login-triggered full sync per this window.
FULL_DEBOUNCE = int(os.environ.get("LDAP_SYNC_FULL_DEBOUNCE_SECONDS", "120"))

_last_user_sync: dict[str, float] = {}
_last_full = [0.0]
_lock = threading.Lock()


def _full_sync_safe(force: bool = False):
    if not force:
        now = time.time()
        with _lock:
            if now - _last_full[0] < FULL_DEBOUNCE:
                return  # a full sync ran very recently — skip
            _last_full[0] = now
    try:
        with _lock:
            _last_full[0] = time.time()
        sync.full_sync()
    except Exception as e:  # noqa: BLE001
        print(f"[ldap-sync] full sync failed: {e}")


def _user_sync_safe(username: str):
    now = time.time()
    with _lock:
        if now - _last_user_sync.get(username, 0) < USER_DEBOUNCE:
            return  # synced recently — skip
        _last_user_sync[username] = now
    try:
        sync.sync_user(username)
    except Exception as e:  # noqa: BLE001
        print(f"[ldap-sync] user sync failed for {username}: {e}")


def _scheduler():
    while True:
        _full_sync_safe(force=True)   # periodic run always proceeds
        time.sleep(INTERVAL)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: str = ""):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        if body:
            self.wfile.write(body.encode())

    def do_GET(self):  # noqa: N802
        if self.path == "/health":
            self._send(200, "ok")
        else:
            self._send(404, "not found")

    def do_POST(self):  # noqa: N802
        parts = [p for p in self.path.split("/") if p]
        if parts == ["sync"]:
            threading.Thread(target=_full_sync_safe, daemon=True).start()
            self._send(202, "full sync started")
        elif len(parts) == 2 and parts[0] == "sync":
            username = parts[1]
            threading.Thread(target=_user_sync_safe, args=(username,), daemon=True).start()
            self._send(202, f"sync started: {username}")
        else:
            self._send(404, "not found")

    def log_message(self, *args):  # quieter logs
        return


def main():
    threading.Thread(target=_scheduler, daemon=True).start()
    print(f"[ldap-sync] periodic every {INTERVAL}s; HTTP trigger on :{PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
