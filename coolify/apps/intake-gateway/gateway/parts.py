"""parts.py — 受信メールから「注文書らしい添付」だけを取り出す純粋ロジック。

ここが取込の品質を決める。素朴に「添付を全部取る」と、HTML 署名に埋まった
会社ロゴが 1 通ごとに注文請書として採番される（それを人が消して回ることになる）。
逆に絞りすぎると注文書が黙って消える。だから選別の規則はここ 1 か所に集め、
IMAP も DB もファイルシステムも触らずテストできるようにしてある。

MIME のデコード（RFC 2047 の encoded-word / RFC 2231 の分割ファイル名 /
ISO-2022-JP・Shift_JIS）は Python 標準の `email` に任せる。国産の複合機と
日本語メールを相手にするとき、自前実装が壊れるのはまさにここ。
"""

from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass
from email.header import decode_header, make_header
from email.message import Message
from typing import Iterator

# nextjs-web の INTAKE_FOLDER_EXT（lib/intake-folder.ts）と一致させる。
# ここを増やすときは向こうも増やさないと、書いても取り込まれない。
INTAKE_EXT = (".pdf", ".png", ".jpg", ".jpeg", ".webp")

# 取り込みはしないが、PDF に変換してから渡す形式（convert.py）。
CONVERT_EXT = (".tif", ".tiff")

ACCEPTED_EXT = INTAKE_EXT + CONVERT_EXT

# nextjs-web 側と同じ 20MB。base64 は実寸の約 1.37 倍になる。
MAX_BYTES = 20 * 1024 * 1024

# ファイル名の長さ上限（バイト）。日本語は UTF-8 で 3 バイト/文字、さらに
# writer.py が {yyyyMMdd-HHmmss}_{rand6}_ の 23 文字を前置するので、
# ext4 / SMB の 255 バイト上限に届き得る。
NAME_MAX_BYTES = 120


@dataclass(frozen=True)
class Attachment:
    """受理した添付 1 件。"""

    filename: str
    content_type: str
    data: bytes

    @property
    def ext(self) -> str:
        return os.path.splitext(self.filename)[1].lower()


def decode_mime_header(raw: str | None) -> str:
    """encoded-word を含むヘッダを普通の文字列にする。壊れていても落ちない。"""
    if not raw:
        return ""
    try:
        return str(make_header(decode_header(raw)))
    except Exception:
        # 宣言された charset が嘘、という壊れたメールは実在する。
        # 読めるところまでで返す（例外で 1 通落とすほうが損）。
        return raw


def decode_filename(part: Message) -> str | None:
    """添付のファイル名。`filename` → 旧式の `name` の順に見る。

    古い国産複合機は Content-Disposition を付けず
    `Content-Type: application/pdf; name="..."` だけを送ってくる。
    """
    raw = part.get_filename()
    if not raw:
        raw = part.get_param("name")
        if isinstance(raw, tuple):
            # RFC 2231 形式 (charset, lang, value)
            charset, _lang, value = raw
            try:
                raw = bytes(value, "ascii").decode(charset or "utf-8", "replace")
            except Exception:
                raw = value
    if not raw:
        return None
    name = decode_mime_header(raw if isinstance(raw, str) else str(raw))
    name = unicodedata.normalize("NFC", name).strip()
    return name or None


def _ext_from_content_type(content_type: str) -> str | None:
    return {
        "application/pdf": ".pdf",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/tiff": ".tif",
    }.get(content_type.lower())


def is_accepted(part: Message, filename: str | None) -> bool:
    """この MIME パートを注文書の添付として受け取るか。

    落とすもの:
      - multipart のコンテナ（中身は別途たどる）
      - 本文に埋め込まれた画像（Content-ID を持つ / disposition が inline）
        → HTML 署名のロゴがこれ。**これを通すと毎通ロゴが採番される**
      - ファイル名が取れないパート
      - 拡張子が対象外（.p7s / .ics / .vcf / .txt / .html はここで消える）
    """
    if part.get_content_maintype() == "multipart":
        return False
    # cid: で本文から参照される画像 = 装飾。添付ではない。
    if part.get("Content-ID"):
        return False
    disposition = (part.get_content_disposition() or "").lower()
    if disposition == "inline":
        return False
    if not filename:
        return False
    return os.path.splitext(filename)[1].lower() in ACCEPTED_EXT


def fallback_filename(content_type: str, uid: str, index: int) -> str | None:
    """ファイル名が読めなかったときの合成名。拡張子が決まらなければ None。

    FAX ゲートウェイの中には Content-Disposition もファイル名も付けず、
    `Content-Type: image/tiff` だけで本体を送ってくるものがある。名前が無い
    という理由だけで捨てると、その注文書は黙って消える。
    """
    ext = _ext_from_content_type(content_type)
    return f"fax_{uid}_{index}{ext}" if ext else None


def resolve_filename(part: Message, uid: str, index: int) -> str | None:
    """このパートに使うファイル名（読めなければ Content-Type から合成）。"""
    return decode_filename(part) or fallback_filename(
        part.get_content_type() or "", uid, index
    )


def iter_attachments(msg: Message, uid: str = "0") -> Iterator[Attachment]:
    """メールから受理できる添付を順に返す。

    受理できないパートは黙って飛ばす（何を落としたかは呼び出し側がログに出す）。
    """
    for index, part in enumerate(msg.walk()):
        filename = resolve_filename(part, uid, index)
        if not is_accepted(part, filename):
            continue
        try:
            data = part.get_payload(decode=True)
        except Exception:
            continue
        if not data or len(data) > MAX_BYTES:
            continue
        assert filename is not None
        yield Attachment(
            filename=filename,
            content_type=(part.get_content_type() or "application/octet-stream"),
            data=data,
        )


def sender_tag(sender: str | None) -> str:
    """送信元をファイル名に入れられる形にする（`@` は `-at-`）。

    来歴が DB に残らない設計なので、**ここがほぼ唯一の手掛かり**になる
    （SY0C の取込待ち一覧と、採番後のファイル名に残り続ける）。
    """
    if not sender:
        return "unknown"
    match = re.search(r"[\w.+-]+@[\w.-]+", sender)
    addr = match.group(0) if match else sender
    local, _, domain = addr.partition("@")
    tag = f"{local}-at-{domain}" if domain else local
    return _scrub(tag)[:64] or "unknown"


def _scrub(name: str) -> str:
    """パス区切り・制御文字を落とす（nextjs-web の sanitizeFileName と同じ規約）。"""
    base = re.split(r"[\\/]", name)[-1]
    cleaned = re.sub(r"[\x00-\x1f<>:\"|?*]", "", base)
    cleaned = re.sub(r"\s+", "_", cleaned)
    cleaned = re.sub(r"^\.+", "", cleaned).strip()
    return cleaned


def _truncate_bytes(name: str, limit: int) -> str:
    """拡張子を守ったままバイト長で切り詰める。"""
    stem, ext = os.path.splitext(name)
    ext_bytes = len(ext.encode("utf-8"))
    room = max(1, limit - ext_bytes)
    encoded = stem.encode("utf-8")
    if len(encoded) <= room:
        return name
    # マルチバイト文字の途中で切らない
    return encoded[:room].decode("utf-8", "ignore") + ext


def inbound_filename(sender: str | None, original: str) -> str:
    """`mail_{送信元}_{元のファイル名}`。

    先頭が `ORD-` になることは無い（`mail_` 固定）。これは重要 —
    `ORD-` は「採番済みの続き」の目印（lib/intake-core.ts parseIntakeFileNumber）
    なので、勝手に付けると別の注文請書の続きだと誤認される。
    """
    safe = _scrub(original) or "order"
    name = f"mail_{sender_tag(sender)}_{safe}"
    return _truncate_bytes(name, NAME_MAX_BYTES)
