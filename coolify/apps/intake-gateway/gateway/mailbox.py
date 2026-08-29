"""mailbox.py — IMAP の入出力だけ。判断は runner.py と parts.py が持つ。

**接続はポーリングごとに張って閉じる。** IDLE も常時接続もしない — 2 分間隔に
IDLE は要らないし、切れっぱなしのソケットを抱えるほうが事故になる。

**完了の記録は「フラグ → 移動」の順。** `\\Seen` を先に打ってから処理済み
フォルダへ移す。移動に失敗しても、次回の UNSEEN 検索からは外れる。
フラグが正しさの機構で、移動は受信箱の衛生の機構。
"""

from __future__ import annotations

import email
import imaplib
import logging
from contextlib import contextmanager
from datetime import datetime, timedelta
from email.message import Message
from typing import Iterator

from .config import Config

log = logging.getLogger(__name__)

# IMAP の SEARCH は日付を DD-Mon-YYYY で書く（ロケール非依存にするため自前で組む）。
_MONTHS = (
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
)


def imap_date(d: datetime) -> str:
    return f"{d.day:02d}-{_MONTHS[d.month - 1]}-{d.year}"


@contextmanager
def connect(cfg: Config) -> Iterator[imaplib.IMAP4]:
    """接続 → メールボックス選択 → 必ず logout。"""
    client: imaplib.IMAP4
    if cfg.ssl:
        client = imaplib.IMAP4_SSL(cfg.host, cfg.port)
    else:
        client = imaplib.IMAP4(cfg.host, cfg.port)
        try:
            client.starttls()
        except Exception as e:
            # 平文のまま資格情報を投げない。
            try:
                client.logout()
            except Exception:
                pass
            raise RuntimeError(f"STARTTLS に失敗しました: {e}") from e
    try:
        client.login(cfg.user, cfg.password)
        typ, _ = client.select(cfg.box)
        if typ != "OK":
            raise RuntimeError(f"メールボックスを開けません: {cfg.box}")
        yield client
    finally:
        try:
            client.close()
        except Exception:
            pass
        try:
            client.logout()
        except Exception:
            pass


def search_unseen(client: imaplib.IMAP4, cfg: Config) -> list[bytes]:
    """未読 & 直近 N 日の UID を古い順に返す。

    SINCE は初回起動時の暴走よけ — 未読が 4 年分たまった受信箱に向けても、
    いきなり全部を舐めない。
    """
    since = imap_date(datetime.now() - timedelta(days=cfg.since_days))
    typ, data = client.uid("SEARCH", None, "UNSEEN", "SINCE", since)  # type: ignore[arg-type]
    if typ != "OK" or not data or not data[0]:
        return []
    uids = data[0].split()
    uids.sort(key=lambda b: int(b))
    return uids[: cfg.max_messages]


def fetch_message(client: imaplib.IMAP4, uid: bytes) -> Message | None:
    """1 通を丸ごと取る。BODY.PEEK なので既読フラグは立たない。"""
    typ, data = client.uid("FETCH", uid, "(BODY.PEEK[])")  # type: ignore[arg-type]
    if typ != "OK" or not data:
        return None
    for item in data:
        if isinstance(item, tuple) and len(item) > 1:
            return email.message_from_bytes(item[1])
    return None


def mark_seen(client: imaplib.IMAP4, uid: bytes) -> None:
    """既読にする。**これが「処理済み」の唯一の記録**。"""
    client.uid("STORE", uid, "+FLAGS", "(\\Seen)")  # type: ignore[arg-type]


def move_to(client: imaplib.IMAP4, uid: bytes, box: str) -> None:
    """別フォルダへ移す（無ければ作る）。失敗しても致命ではない。"""
    if not box:
        return
    typ, _ = client.uid("COPY", uid, box)  # type: ignore[arg-type]
    if typ != "OK":
        client.create(box)
        typ, _ = client.uid("COPY", uid, box)  # type: ignore[arg-type]
        if typ != "OK":
            log.warning("メールを %s へ移せませんでした（既読にはしてあります）", box)
            return
    client.uid("STORE", uid, "+FLAGS", "(\\Deleted)")  # type: ignore[arg-type]
    client.expunge()
