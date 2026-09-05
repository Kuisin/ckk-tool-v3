"""runner.py — 受信箱を巡回して添付を取込フォルダへ置く。

**「完了」の定義 — 端から端まで一度試したら完了。**

| 結果 | 扱い |
|---|---|
| 受理した添付を全部書けた | `\\Seen` + 処理済みへ移動 |
| 受理できる添付が 0（本文だけ・署名だけ） | `\\Seen`、移動しない（人が見られるよう残す） |
| 一部だけ成功 | `\\Seen`（**再送しない**）+ 大きくログ + 失敗フォルダへ |
| 接続・認証・マウント不可 | 未読のまま。ポーリングごと中断 |

意図的な取引: **取込フォルダに二重に落ちた注文書を後から片付けるコストの
ほうが、落ちなかった添付を人に再送してもらうコストより高い。** だから半分
成功したメールは再試行しない。

**それでも再配達は起きる。** `\\Seen` は書き込みの**後**に打つので、その間に
IMAP が切れると次の巡回で同じメールがまた未読で降ってくる（フラグを先に
打つ順序にしても、今度は書き損ねが黙って消えるだけで穴は移動するだけ）。
そこで添付単位の冪等キー **(uid, 添付の sha256)** を seen.py の台帳に残し、
一度置いた添付は二度置かない。上の表の扱いは変えていない — 台帳に無い
（＝本当に新しい）添付だけが「受理」として数えられる。

**冪等性のもう一方の要**は起動時の ensure_writable。書けないまま受信を
始めると全部の添付が失敗し、それでも既読が付く = 注文書が黙って消える。
だから書けないときはポーリングを**始めない**。
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import time
from email.message import Message

from . import config, mailbox
from .convert import ConvertError, needs_conversion, tiff_to_pdf, to_pdf_name
from .parts import decode_mime_header, inbound_filename, iter_attachments
from .seen import SeenStore
from .writer import IntakeWriteError, ensure_writable, write_to_intake

log = logging.getLogger("intake-gateway")

_stop = False


def _handle_sigterm(signum: int, frame: object) -> None:
    global _stop
    _stop = True
    log.info("停止要求を受けました。現在のポーリングを終えて終了します")


def process_message(
    cfg: config.Config, msg: Message, uid: str, seen: SeenStore | None = None
) -> tuple[int, int, int]:
    """1 通を処理する。戻り値 (受理数, 書けた数, 失敗数)。

    `seen` を渡すと、既に取込フォルダへ置いた添付（同じ uid・同じバイト列）を
    読み飛ばす。読み飛ばした添付は「受理」に数えない — 数えると、全部が
    再配達だったメールが「受理はしたが 1 件も保存しなかった」に見えて
    失敗フォルダへ送られてしまう。
    """
    sender = decode_mime_header(msg.get("From"))
    subject = decode_mime_header(msg.get("Subject"))

    if not cfg.sender_allowed(sender):
        log.info("uid=%s 送信元が許可リストに無いため無視: %s", uid, sender)
        return (0, 0, 0)

    accepted = 0
    saved = 0
    failed = 0
    duplicates = 0
    for att in iter_attachments(msg, uid=uid):
        # 冪等キーは**変換前の**バイト列で取る（TIFF→PDF の出力が毎回同じ
        # バイト列になる保証は無い）。
        if seen is not None and seen.has(uid, att.data):
            duplicates += 1
            log.info(
                "uid=%s 取込済みのため読み飛ばし: %s（再配達）", uid, att.filename
            )
            continue
        accepted += 1
        filename = att.filename
        data = att.data
        if needs_conversion(filename):
            try:
                data = tiff_to_pdf(data)
                filename = to_pdf_name(filename)
                log.info("uid=%s TIFF を PDF に変換: %s", uid, filename)
            except ConvertError as e:
                failed += 1
                log.error("uid=%s TIFF を変換できませんでした: %s: %s", uid, att.filename, e)
                continue
        try:
            name = write_to_intake(
                cfg.intake_dir, inbound_filename(sender, filename), data
            )
            saved += 1
            # 置けた直後に覚える。ここで落ちても次回は読み飛ばせる。
            if seen is not None:
                seen.record(uid, att.data)
            log.info(
                "uid=%s 取込フォルダへ配置: %s（元=%s 送信元=%s 件名=%s）",
                uid, name, att.filename, sender, subject,
            )
        except IntakeWriteError as e:
            failed += 1
            log.error("uid=%s 書き込みに失敗: %s: %s", uid, att.filename, e)

    if accepted == 0 and duplicates == 0:
        log.info("uid=%s 受理できる添付なし（送信元=%s 件名=%s）", uid, sender, subject)
    elif accepted == 0:
        # 全部が再配達。既読を打ち直して処理済みへ送るだけで、何も置かない。
        log.info(
            "uid=%s 全 %d 件が取込済みでした（再配達。何も置いていません）",
            uid, duplicates,
        )
    # 再配達ぶんも「一度は扱った」に数える — さもないと全部が重複だった
    # メールが「添付ゼロ」と同じ扱いになり、受信箱に残り続ける。
    return (accepted + duplicates, saved, failed)


# 生存の印。巡回のたび（成功・失敗を問わず）と無効待機中に更新し、Dockerfile の
# HEALTHCHECK がこの mtime を見る。IMAP が半開で固まるとここが止まる → unhealthy。
ALIVE_STAMP = os.environ.get("INTAKE_ALIVE_STAMP", "/tmp/intake-gateway-alive")


def touch_alive() -> None:
    try:
        with open(ALIVE_STAMP, "a"):
            os.utime(ALIVE_STAMP, None)
    except OSError:
        log.debug("生存の印を更新できませんでした: %s", ALIVE_STAMP)


def poll_once(cfg: config.Config) -> tuple[int, int]:
    """1 巡。戻り値 (見たメール数, 置いたファイル数)。"""
    messages = 0
    files = 0
    # 巡回ごとに読み直す（別プロセスが書き換えることは無いが、台帳を手で
    # 消して作り直せるほうが運用しやすい）。ついでに古い記録を刈る。
    seen = SeenStore(cfg.intake_dir)
    with mailbox.connect(cfg) as client:
        # サーバーごとに「受信箱の下」の書き方が違う（Sakura は INBOX. 接頭辞が
        # 要り、無いと Invalid mailbox name. で移動できない）。設定に書かせず聞く。
        prefix = mailbox.namespace_prefix(client)
        uids = mailbox.search_unseen(client, cfg)
        if not uids:
            return (0, 0)
        log.info("未読 %d 通を処理します", len(uids))
        for raw_uid in uids:
            if _stop:
                log.info("停止要求のため残りは次回に回します")
                break
            uid = raw_uid.decode("ascii", "replace")
            try:
                msg = mailbox.fetch_message(client, raw_uid)
                if msg is None:
                    log.warning("uid=%s 取得できませんでした（次回に回します）", uid)
                    continue
                accepted, saved, failed = process_message(cfg, msg, uid, seen)
            except Exception:
                # 壊れた MIME 1 通でポーリング全体を落とさない。ただし既読にはする
                # （さもないと毎回同じ例外で止まり、後続が永久に処理されない）。
                log.exception("uid=%s 処理中に例外。既読にして次へ進みます", uid)
                accepted, saved, failed = (0, 0, 1)

            messages += 1
            files += saved

            # ここから先は「一度試した」の記録。フラグを先、移動を後。
            mailbox.mark_seen(client, raw_uid)
            if failed:
                log.error(
                    "uid=%s 一部/全部が失敗（受理=%d 保存=%d 失敗=%d）。"
                    "**再送しません** — 必要なら送信者に再送を依頼してください",
                    uid, accepted, saved, failed,
                )
                mailbox.move_to(client, raw_uid, cfg.failed_box, prefix)
            elif accepted:
                mailbox.move_to(client, raw_uid, cfg.processed_box, prefix)
            # 添付ゼロは移動しない（人が受信箱で見つけられるように残す）
    return (messages, files)


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )
    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    cfg = config.load()
    reason = cfg.why_disabled()
    if reason:
        # 終了せず待つ — Coolify の restart ループでログが流れるのを避ける。
        log.warning("メール取込は無効です（%s）。設定されるまで何もしません", reason)
        while not _stop:
            touch_alive()
            time.sleep(60)
        return 0

    # 書けないまま受信を始めると注文書が黙って消える。ここで止める。
    try:
        ensure_writable(cfg.intake_dir)
    except IntakeWriteError as e:
        log.error("取込フォルダが使えません: %s", e)
        return 1

    log.info(
        "メール取込を開始します: %s / %s:%d box=%s → %s（%d 秒間隔）",
        cfg.user, cfg.host, cfg.port, cfg.box, cfg.intake_dir, cfg.poll_seconds,
    )
    while not _stop:
        try:
            messages, files = poll_once(cfg)
            if messages:
                log.info("巡回完了: %d 通 / %d ファイル", messages, files)
        except Exception:
            log.exception("巡回に失敗しました（次回再試行します）")
        touch_alive()
        # 停止要求に素早く反応するため小刻みに眠る
        for _ in range(cfg.poll_seconds):
            if _stop:
                break
            time.sleep(1)
    log.info("終了します")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
