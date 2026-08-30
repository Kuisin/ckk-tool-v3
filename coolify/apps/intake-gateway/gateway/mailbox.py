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
import re
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


# ── メールボックス名の名前空間 ─────────────────────────────────────────
# サーバーによって「受信箱の下」の書き方が違う。Sakura（Courier 系）は
# NAMESPACE が (("INBOX." ".")) を返し、`Processed` は
# **Invalid mailbox name.** で作れない — `INBOX.Processed` でなければならない。
# Dovecot の多くは personal prefix が空なので `Processed` のままでよい。
# 設定に `INBOX.` を書かせると移植性が無くなるので、接続時に聞いて自動で付ける。


def parse_namespace_prefix(raw: object) -> str:
    """NAMESPACE の応答から personal 名前空間の接頭辞を取り出す。

    例: (("INBOX." ".")) NIL (...) → "INBOX."
        (("" "/")) NIL (...)       → ""
    読めなければ "" を返す（＝何も足さない。従来どおりの挙動）。
    """
    if isinstance(raw, (bytes, bytearray)):
        text = raw.decode("utf-8", "replace")
    elif isinstance(raw, (list, tuple)):
        parts = []
        for item in raw:
            if isinstance(item, (bytes, bytearray)):
                parts.append(item.decode("utf-8", "replace"))
            elif isinstance(item, str):
                parts.append(item)
        text = " ".join(parts)
    else:
        text = str(raw or "")
    m = re.search(r'\(\s*\(\s*"([^"]*)"', text)
    return m.group(1) if m else ""


def qualify_box(name: str, prefix: str) -> str:
    """設定されたフォルダ名を、このサーバーで通る形にする。"""
    if not name or not prefix:
        return name
    if name == "INBOX" or name.startswith(prefix):
        return name
    return f"{prefix}{name}"


def namespace_prefix(client: imaplib.IMAP4) -> str:
    """接続中のサーバーの personal 接頭辞（取れなければ ""）。"""
    try:
        typ, data = client.namespace()
    except Exception:
        return ""
    return parse_namespace_prefix(data) if typ == "OK" else ""


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


def move_to(client: imaplib.IMAP4, uid: bytes, box: str, prefix: str = "") -> None:
    """別フォルダへ移す（無ければ作る）。失敗しても致命ではない。

    `prefix` はサーバーの personal 名前空間（Sakura なら "INBOX."）。
    設定に書かせず接続時に聞いた値をここで足す。
    """
    if not box:
        return
    target = qualify_box(box, prefix)
    typ, _ = client.uid("COPY", uid, target)  # type: ignore[arg-type]
    if typ != "OK":
        client.create(target)
        typ, _ = client.uid("COPY", uid, target)  # type: ignore[arg-type]
        if typ != "OK":
            log.warning("メールを %s へ移せませんでした（既読にはしてあります）", target)
            return
    client.uid("STORE", uid, "+FLAGS", "(\\Deleted)")  # type: ignore[arg-type]
    client.expunge()
