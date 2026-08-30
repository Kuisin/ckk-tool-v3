"""mail_monitor.py — 取込用メールボックスの健康状態。

**なぜ要るか** — 注文書のメール取込は、止まっても誰も気付かない種類の仕組み。
ゲートウェイが落ちれば受信箱に未読が溜まるだけで、画面上は「注文が来ない」
としか見えない。実際に効く見張りは 3 つだけ:

  1. IMAP に入れるか      … 資格情報の失効・サーバー障害
  2. 未読が溜まっていないか … ゲートウェイが動いていない（一番多い）
  3. Failed に居ないか     … 取り込めなかった注文書。**人が拾う必要がある**

資格情報は admintools が既に持っている（mail_accounts.password）ので、
監視のために新しい秘密を置かない。IMAP は Python 標準ライブラリ。
"""

from __future__ import annotations

import imaplib
import os
import re
import ssl
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# 監視対象の選び方。既定は取込用（other-sys.order-intake…）。
# 増えたら env で足せるようにしておく（コードを触らずに済むように）。
MONITOR_PATTERN = os.environ.get("MAIL_MONITOR_PATTERN", r"^other-sys\.order-intake")
IMAP_HOST = os.environ.get("SAKURA_IMAP_HOST", "ckk-tool.sakura.ne.jp")
IMAP_PORT = int(os.environ.get("SAKURA_IMAP_PORT", "993"))
IMAP_TIMEOUT = int(os.environ.get("MAIL_MONITOR_TIMEOUT", "15"))

# 「未読が溜まっている」とみなす閾値。ゲートウェイは 120 秒ごとに回るので、
# 数通残っていれば普通は異常。少し余裕をみる。
UNREAD_WARN = int(os.environ.get("MAIL_MONITOR_UNREAD_WARN", "3"))
# 最後の受信からこれ以上経っていたら「静かすぎる」— ただし**警告にはしない**
# （注文が来ない日は普通にある）。表示だけ。
QUIET_HOURS = int(os.environ.get("MAIL_MONITOR_QUIET_HOURS", "72"))


@dataclass
class BoxStat:
    name: str
    exists: bool
    total: int = 0
    unseen: int = 0
    newest: str | None = None


@dataclass
class MailboxHealth:
    username: str
    email: str
    ok: bool
    error: str | None = None
    boxes: list[BoxStat] | None = None
    # 判定（表示側で色を決めるのに使う）
    level: str = "ok"          # ok | warn | error
    messages: list[str] | None = None

    def as_dict(self) -> dict:
        d = asdict(self)
        d["boxes"] = [asdict(b) for b in (self.boxes or [])]
        return d


def _prefix(client: imaplib.IMAP4) -> str:
    """personal 名前空間の接頭辞（さくらは "INBOX."）。取れなければ空。"""
    try:
        typ, data = client.namespace()
    except Exception:
        return ""
    if typ != "OK":
        return ""
    text = " ".join(
        x.decode("utf-8", "replace") if isinstance(x, (bytes, bytearray)) else str(x)
        for x in (data or [])
    )
    m = re.search(r'\(\s*\(\s*"([^"]*)"', text)
    return m.group(1) if m else ""


def _qualify(name: str, prefix: str) -> str:
    if not name or not prefix or name == "INBOX" or name.startswith(prefix):
        return name
    return f"{prefix}{name}"


def _newest(client: imaplib.IMAP4) -> str | None:
    """選択中のフォルダで一番新しいメールの日時（取れなければ None）。"""
    try:
        typ, data = client.uid("SEARCH", None, "ALL")
        uids = (data[0] or b"").split() if typ == "OK" else []
        if not uids:
            return None
        typ, d = client.uid("FETCH", uids[-1], "(BODY.PEEK[HEADER.FIELDS (DATE)])")
        for item in d or []:
            if isinstance(item, tuple) and len(item) > 1:
                raw = item[1].decode("utf-8", "replace")
                m = re.search(r"Date:\s*(.+)", raw)
                if m:
                    return parsedate_to_datetime(m.group(1).strip()).isoformat()
    except Exception:
        return None
    return None


def _count(client: imaplib.IMAP4, box: str) -> BoxStat:
    typ, _ = client.select(box, readonly=True)
    if typ != "OK":
        return BoxStat(name=box, exists=False)
    total = unseen = 0
    try:
        t, d = client.uid("SEARCH", None, "ALL")
        total = len((d[0] or b"").split()) if t == "OK" else 0
        t, d = client.uid("SEARCH", None, "UNSEEN")
        unseen = len((d[0] or b"").split()) if t == "OK" else 0
    except Exception:
        pass
    return BoxStat(name=box, exists=True, total=total, unseen=unseen, newest=_newest(client))


def judge(inbox: BoxStat, processed: BoxStat, failed: BoxStat) -> tuple[str, list[str]]:
    """3 つのフォルダの数字から「異常か」を決める。**ここが監視の中身**。

    純粋関数にしてあるのは、間違えやすいのがまさにここだから — 誤検知が続くと
    監視そのものが読まれなくなる。実際、最初の版は「処理済みフォルダが無い」を
    警告にしていて、**新しい受信箱で必ず誤検知**していた（あのフォルダは初回の
    取込時に作られる）。
    """
    level = "ok"
    msgs: list[str] = []

    if failed.exists and failed.total:
        level = "error"
        msgs.append(f"取り込めなかったメールが {failed.total} 通あります。"
                    "自動では再送しないので、人が拾ってください")

    if inbox.unseen >= UNREAD_WARN:
        level = "error" if level == "error" else "warn"
        msgs.append(f"未読が {inbox.unseen} 通たまっています。"
                    "ゲートウェイが動いていない可能性があります")

    # 処理済みフォルダは初回取込時に作られるので、無いだけでは異常ではない。
    # 困るのは「処理されたのに移されていない」= 受信箱に既読が溜まっている場合。
    if not processed.exists:
        handled = max(0, inbox.total - inbox.unseen)
        if handled:
            level = "error" if level == "error" else "warn"
            msgs.append(f"処理済みフォルダが無いまま既読が {handled} 通あります。"
                        "移動に失敗している可能性があります（受信箱が肥大します）")
        else:
            msgs.append("処理済みフォルダはまだありません（初回の取込時に作られます）")

    if level == "ok":
        msgs.insert(0, "正常です")
    return level, msgs


def check_mailbox(email: str, password: str, username: str = "") -> MailboxHealth:
    """1 つの受信箱を読み取り専用で覗く。**何も変更しない**（既読も付けない）。"""
    h = MailboxHealth(username=username or email, email=email, ok=False, boxes=[], messages=[])
    try:
        client = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT,
                                   ssl_context=ssl.create_default_context(),
                                   timeout=IMAP_TIMEOUT)
    except Exception as e:
        h.error = f"接続できません: {type(e).__name__}"
        h.level = "error"
        return h
    try:
        try:
            client.login(email, password)
        except Exception:
            # 中身は出さない（パスワードが誤りか失効か、までは言えない）
            h.error = "ログインできません（資格情報を確認してください）"
            h.level = "error"
            return h
        p = _prefix(client)
        boxes = [_count(client, "INBOX"),
                 _count(client, _qualify("Processed", p)),
                 _count(client, _qualify("Failed", p))]
        h.boxes = boxes
        h.ok = True
        inbox, processed, failed = boxes

        h.level, h.messages = judge(inbox, processed, failed)
        return h
    finally:
        try:
            client.logout()
        except Exception:
            pass


def quiet_since(newest_iso: str | None) -> int | None:
    """最後の受信からの経過時間（時間）。判定には使わない — 表示のみ。"""
    if not newest_iso:
        return None
    try:
        dt = datetime.fromisoformat(newest_iso)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int((datetime.now(timezone.utc) - dt) / timedelta(hours=1))


def monitored(accounts) -> list:
    """監視対象（取込用メールボックス）だけを選ぶ。"""
    rx = re.compile(MONITOR_PATTERN)
    return [a for a in accounts if a.is_active and rx.search(a.username or "")]
