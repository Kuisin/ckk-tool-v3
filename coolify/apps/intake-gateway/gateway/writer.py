"""writer.py — 取込フォルダ（INTAKE_DIR）へ直接書き込む。

nextjs-web の `saveToIntakeFolder`（lib/intake-folder.ts）と同じことを Python
側で行う。**コピーではなく再実装**なので、守る契約は 3 つだけ:

1. `.part` に書いてから rename する
   同一ファイルシステム内の rename はアトミックなので、ポーラーは完成品しか
   見ない。これを省くと**半分書けた PDF を po-extract に送る**
   （scanIntakeFolder の mtime 5 秒待ちは大きい PDF では足りない）。
   `.part` は拡張子で判定されるので、ポーラーからは不可視。

2. 名前が一意であること
   形は TS 側の systematicFileName に合わせて
   `{yyyyMMdd-HHmmss}_{rand6}_{元名}` にする（SY0C の一覧で見た目が揃う）。
   書式が将来ずれても実害は無い — ポーラーが見るのは拡張子と `ORD-` の有無だけ。

3. 「採番済みの続き」に見える名前を作らないこと
   nextjs-web は採番した時点でファイルを `{注文請書の id}-{元名}` に改名し、
   その形を目印に「どの行の続きか」を読む（lib/intake-core.ts
   parseIntakeFileNumber）。勝手にその形の名前を置くと、別の注文請書の続きだと
   誤認されて採番がやり直されない。目印の形は 3 つ（`looks_numbered`）:
     `CKK~ORD-2026-00001-…`  いまの形（自社法人コード + `~` + 番号）
     `ORD-2026-00001-…`      法人コードなし
     `ORD-202608-00003-…`    旧番号（番号を DB が振るようになる前の形）

⚠️ uid/gid — このディレクトリは nextjs-web と共有する。向こうはここに置かれた
ファイルを `.processing` へ改名し、最後に `processed/` へ移す。rename には
**ディレクトリ**の書き込み・実行権が要るので、両方のコンテナが書ける状態に
しておくこと。ずれると EACCES で黙って止まる。
"""

from __future__ import annotations

import os
import random
import re
import tempfile
from datetime import datetime

from .parts import INTAKE_EXT, _scrub

# TS 側（file-naming.ts）と同じ字種。紛らわしい文字（i/l/o/0/1）を除いてある。
RAND_CHARS = "abcdefghjkmnpqrstuvwxyz23456789"


# 「採番済みの続き」の目印。nextjs-web lib/intake-core.ts の INTAKE_NUMBER_RE と
# 同じ形（向こうを変えたらここも変える）。旧番号（年月 6 桁）も受ける —
# 取込フォルダには切り替え前に改名されたファイルが残り得る。
#
# 先頭の (?!日時_) は、置かれたばかりの名前（unique_name の
# `{yyyyMMdd-HHmmss}_{rand6}_{元名}`）を目印と読まないため。法人コードは `~` と
# 空白以外の何でもよいので、元名が `CKK~ORD-2026-00001-x.pdf` だと日時ごと
# 「法人コード」に読めてしまう。
NUMBERED_NAME_RE = re.compile(
    r"^(?!\d{8}-\d{6}_)(?:[^~/\s]+~)?ORD-(?:\d{4}|\d{6})-\d{5}-"
)


def looks_numbered(name: str) -> bool:
    """採番済みの続き（`[法人コード~]ORD-…-`）に見える名前か。

    `ORD-` 始まりは形が崩れていても弾く（従来どおり・安全側）。
    """
    return name.startswith("ORD-") or NUMBERED_NAME_RE.match(name) is not None


class IntakeWriteError(RuntimeError):
    """書き込めなかった（未対応形式・マウント不可など）。"""


def _rand_suffix(n: int = 6) -> str:
    return "".join(random.choice(RAND_CHARS) for _ in range(n))


def unique_name(original: str, now: datetime | None = None) -> str:
    """`{yyyyMMdd-HHmmss}_{rand6}_{安全化した元名}`。"""
    stamp = (now or datetime.now()).strftime("%Y%m%d-%H%M%S")
    safe = _scrub(original) or "file"
    return f"{stamp}_{_rand_suffix()}_{safe}"


def is_intake_file(name: str) -> bool:
    """ポーラーが拾える拡張子か（TS 側 isIntakeFile と同じ集合）。"""
    return os.path.splitext(name)[1].lower() in INTAKE_EXT


def ensure_writable(directory: str) -> None:
    """起動時の確認 — 書けないなら**ポーリングを始めない**。

    書けないまま受信を始めると、全部の添付が失敗し、それでもメールには既読が
    付く（runner の「一度試したら完了」規則）。つまり**注文書が黙って消える**。
    起動時にここで落としておく。
    """
    if not directory:
        raise IntakeWriteError("取込フォルダ（INTAKE_DIR）が未設定です")
    if not os.path.isdir(directory):
        raise IntakeWriteError(f"取込フォルダが存在しません: {directory}")
    try:
        with tempfile.NamedTemporaryFile(dir=directory, prefix=".probe-", delete=True):
            pass
    except OSError as e:
        raise IntakeWriteError(
            f"取込フォルダに書き込めません（uid/gid を確認）: {directory}: {e}"
        ) from e


def write_to_intake(directory: str, filename: str, data: bytes) -> str:
    """1 ファイルを取込フォルダへ置く。戻り値は実際に置かれたファイル名。"""
    if not directory:
        raise IntakeWriteError("取込フォルダ（INTAKE_DIR）が未設定です")
    if not is_intake_file(filename):
        raise IntakeWriteError(f"対応していないファイル形式です: {filename}")

    name = unique_name(filename)
    # 採番済みの続きだと誤認されないこと（unique_name は日付始まりなので
    # 本来あり得ないが、規約なので明示的に守る）。
    if looks_numbered(name):
        raise IntakeWriteError(f"採番済みの続きに見える名前は作れません: {name}")

    final = os.path.join(directory, name)
    tmp = f"{final}.part"
    try:
        with open(tmp, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        # 同一ディレクトリなので rename はアトミック。
        os.replace(tmp, final)
    except OSError as e:
        # 途中で落ちた .part を残さない（残すと誰も掃除しない）。
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise IntakeWriteError(f"書き込みに失敗しました: {filename}: {e}") from e
    return name
