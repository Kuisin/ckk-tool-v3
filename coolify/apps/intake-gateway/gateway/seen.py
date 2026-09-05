"""seen.py — 一度取り込んだ添付を覚えておく（重複取込の防止）。

runner の「一度試したら完了」規則は `\\Seen` を**書き込みの後**に打つ。その 2 つの
間で IMAP が切れると、次の巡回で同じメールがまた未読として降ってきて、**同じ
注文書がもう一度採番される**。フラグの順序をどう入れ替えても消えない穴で
（先に打てば書き損ねが黙って消える）、消せるのは「この添付はもう置いた」を
こちら側が覚えている場合だけ。

覚える単位は **(uid, 添付バイト列の sha256)**。uid だけでは足りない — 1 通に
複数の添付があり、前回は一部だけ書けたかもしれない（partial success）。
ハッシュだけでも足りない — 同じ注文書を客が本当に 2 通送ってくることがあり、
それは別の取込として扱いたい。

置き場は `INTAKE_DIR/.gateway/seen.json`。取込フォルダの中に置くのは、
**覚えている内容と実際に置いたファイルの寿命を揃える**ため（別のボリュームに
置くと、取込フォルダだけ作り直したときに「置いたことになっているのに無い」
が発生する）。ドットディレクトリなので nextjs-web のポーラー
（scanIntakeFolder）からは不可視で、SY06 の「システムファイル」でも隠れる。

依存は増やさない（sqlite も可能だが、数百件の台帳に schema を持ち込む理由が
無い）。1 インスタンス運用が前提 — メール取込は環境で分けられず common/main に
1 つだけなので、ファイルの排他は考えない（README のとおり 2 台目を上げると
同じ受信箱を奪い合う。それはここでは解けない別の問題）。

**壊れていたら捨てて作り直す。** 台帳が読めないことを理由に取込を止めると、
注文書が届かなくなる。重複のほうが軽い（人が消せる）。
"""

from __future__ import annotations

import json
import logging
import os
import time
from hashlib import sha256

log = logging.getLogger("intake-gateway")

STATE_DIR = ".gateway"
STATE_FILE = "seen.json"

# これより古い記録は捨てる。IMAP の再配達は数分〜数日の話なので 90 日あれば
# 十分に長く、台帳が無限に伸びない。
RETENTION_DAYS = 90
RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60


def attachment_key(uid: str, data: bytes) -> str:
    """台帳のキー。`{uid}:{添付の sha256}`。"""
    return f"{uid}:{sha256(data).hexdigest()}"


class SeenStore:
    """取込済みの添付の台帳。ファイル 1 本。

    使い方は `has()` → 書く → `record()` の 3 手。`record()` はその場で
    保存する（次の 1 行で落ちても覚えているように）。
    """

    def __init__(self, intake_dir: str, now: float | None = None) -> None:
        self.dir = os.path.join(intake_dir, STATE_DIR)
        self.path = os.path.join(self.dir, STATE_FILE)
        self.entries: dict[str, float] = {}
        self._load()
        self.prune(now=now)

    # ── 読み書き ────────────────────────────────────────────────────────
    def _load(self) -> None:
        try:
            with open(self.path, encoding="utf-8") as fh:
                raw = json.load(fh)
        except FileNotFoundError:
            return
        except (OSError, ValueError) as e:
            # 壊れていても取込は止めない（重複より欠落のほうが重い）。
            log.warning("取込済み台帳を読めませんでした。作り直します: %s: %s", self.path, e)
            return
        entries = raw.get("entries") if isinstance(raw, dict) else None
        if not isinstance(entries, dict):
            log.warning("取込済み台帳の形が違います。作り直します: %s", self.path)
            return
        for key, at in entries.items():
            if isinstance(key, str) and isinstance(at, (int, float)):
                self.entries[key] = float(at)

    def save(self) -> None:
        """台帳を書き出す。**失敗しても例外は投げない**（取込を止めない）。"""
        payload = {"version": 1, "entries": self.entries}
        tmp = f"{self.path}.part"
        try:
            os.makedirs(self.dir, exist_ok=True)
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh)
                fh.flush()
                os.fsync(fh.fileno())
            # 同一ディレクトリなので rename はアトミック（writer.py と同じ約束）。
            os.replace(tmp, self.path)
        except OSError as e:
            # 保存できない = 次回の重複を防げない。取込自体は続ける。
            log.warning("取込済み台帳を保存できませんでした: %s: %s", self.path, e)
            try:
                os.unlink(tmp)
            except OSError:
                pass

    # ── 問い合わせ ──────────────────────────────────────────────────────
    def has(self, uid: str, data: bytes) -> bool:
        """この添付はもう取込フォルダへ置いたか。"""
        return attachment_key(uid, data) in self.entries

    def record(self, uid: str, data: bytes, now: float | None = None) -> None:
        """置けたことを覚える。その場で保存する。"""
        self.entries[attachment_key(uid, data)] = now if now is not None else time.time()
        self.save()

    def prune(self, now: float | None = None) -> int:
        """保持期間を過ぎた記録を捨てる。戻り値は捨てた件数。"""
        cutoff = (now if now is not None else time.time()) - RETENTION_SECONDS
        stale = [k for k, at in self.entries.items() if at < cutoff]
        for k in stale:
            del self.entries[k]
        if stale:
            log.info("取込済み台帳から古い記録を %d 件消しました", len(stale))
            self.save()
        return len(stale)
