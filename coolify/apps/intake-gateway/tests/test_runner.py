"""test_runner.py — 「完了」の記録の仕方。

固定したいのは 2 点:
  1. `\\Seen` を**移動より先**に打つこと（移動に失敗しても再処理されない）
  2. 一部でも失敗したら**再送しない**こと（再試行すると重複が確定するため）
IMAP サーバーは使わない — mailbox の入出力を差し替える。
"""

import contextlib
import os
import tempfile
import unittest
from email import message_from_string
from unittest import mock

from gateway import mailbox as mailbox_mod
from gateway import runner
from gateway.config import Config
from gateway.seen import SeenStore

PDF_B64 = "JVBERi0xLjQK"

ONE_PDF = f"""From: tanaka@example.co.jp
Subject: order
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b"

--b
Content-Type: application/pdf
Content-Disposition: attachment; filename="order.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--b--
"""

NO_ATTACHMENT = """From: tanaka@example.co.jp
Subject: hello
Content-Type: text/plain; charset=UTF-8

添付を忘れました
"""


def cfg_for(directory: str, **over) -> Config:
    base = dict(
        intake_dir=directory,
        host="imap.example.jp",
        port=993,
        ssl=True,
        user="orders@example.jp",
        password="pw",
        box="INBOX",
        processed_box="Processed",
        failed_box="Failed",
        poll_seconds=120,
        max_messages=20,
        since_days=7,
        allow_from=(),
    )
    base.update(over)
    return Config(**base)


class FakeClient:
    """呼ばれた操作を順番に記録するだけの偽 IMAP クライアント。"""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []


@contextlib.contextmanager
def fake_connect(_cfg):
    yield FakeClient()


class TestPolicy(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name
        self.cfg = cfg_for(self.dir)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _run(self, raw: str, prefix: str = ""):
        client_calls: list[tuple[str, str]] = []

        def mark_seen(_c, uid):
            client_calls.append(("seen", uid.decode()))

        def move_to(_c, uid, box, pfx=""):
            # 実物と同じ整形を通す（接頭辞が効いているかをここで見る）
            client_calls.append(("move", mailbox_mod.qualify_box(box, pfx)))

        with (
            mock.patch.object(runner.mailbox, "connect", fake_connect),
            mock.patch.object(runner.mailbox, "namespace_prefix", lambda c: prefix),
            mock.patch.object(runner.mailbox, "search_unseen", lambda c, cfg: [b"7"]),
            mock.patch.object(
                runner.mailbox, "fetch_message", lambda c, u: message_from_string(raw)
            ),
            mock.patch.object(runner.mailbox, "mark_seen", mark_seen),
            mock.patch.object(runner.mailbox, "move_to", move_to),
        ):
            result = runner.poll_once(self.cfg)
        return result, client_calls

    def test_成功したら既読にしてから処理済みへ移す(self):
        (messages, files), calls = self._run(ONE_PDF)
        self.assertEqual((messages, files), (1, 1))
        # 順序が命 — 既読が先。移動に失敗しても再処理されない。
        self.assertEqual(calls, [("seen", "7"), ("move", "Processed")])
        # .gateway（取込済み台帳）は取込対象ではないので数えない
        written = [n for n in os.listdir(self.dir) if not n.startswith(".")]
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0].endswith("order.pdf"), written)
        self.assertIn("mail_tanaka-at-example.co.jp", written[0])

    def test_添付が無ければ既読にするが移動しない(self):
        # 人が受信箱で見つけられるように残す
        (messages, files), calls = self._run(NO_ATTACHMENT)
        self.assertEqual((messages, files), (1, 0))
        self.assertEqual(calls, [("seen", "7")])
        self.assertEqual(os.listdir(self.dir), [])

    def test_書き込みに失敗しても既読にして失敗フォルダへ(self):
        # 再試行すると重複が確定するので、失敗しても再送しない
        with mock.patch.object(
            runner, "write_to_intake", side_effect=runner.IntakeWriteError("boom")
        ):
            (messages, files), calls = self._run(ONE_PDF)
        self.assertEqual((messages, files), (1, 0))
        self.assertEqual(calls, [("seen", "7"), ("move", "Failed")])

    def test_許可リスト外の送信元は取り込まない(self):
        self.cfg = cfg_for(self.dir, allow_from=("only@allowed.jp",))
        (messages, files), calls = self._run(ONE_PDF)
        self.assertEqual(files, 0)
        self.assertEqual(os.listdir(self.dir), [])
        # 読んだことは記録する（未読のまま残すと毎回引っかかる）
        self.assertEqual(calls, [("seen", "7")])

    def test_Sakuraでは処理済みフォルダにINBOX接頭辞が付く(self):
        # 素の "Processed" は Invalid mailbox name. になる（実機で踏んだ）
        (messages, files), calls = self._run(ONE_PDF, prefix="INBOX.")
        self.assertEqual(calls, [("seen", "7"), ("move", "INBOX.Processed")])

    def test_接頭辞が無いサーバーではそのまま(self):
        (_m, _f), calls = self._run(ONE_PDF, prefix="")
        self.assertEqual(calls, [("seen", "7"), ("move", "Processed")])

    def test_例外が出ても既読にして先へ進む(self):
        # 毒メールで永久に止まらないこと
        with mock.patch.object(
            runner, "process_message", side_effect=RuntimeError("broken mime")
        ):
            (messages, files), calls = self._run(ONE_PDF)
        self.assertEqual(files, 0)
        self.assertEqual(calls, [("seen", "7"), ("move", "Failed")])


class TestRedelivery(unittest.TestCase):
    """`\\Seen` を打つ前に IMAP が切れた場合の再配達。

    同じメールがもう一度未読で降ってくるが、**同じ注文書を二度採番させない**。
    """

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name
        self.cfg = cfg_for(self.dir)
        self.msg = message_from_string(ONE_PDF)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _written(self) -> list[str]:
        # .gateway（台帳）は取込対象ではないので数えない
        return [n for n in os.listdir(self.dir) if not n.startswith(".")]

    def test_同じメールが再配達されても二度は置かない(self):
        seen = SeenStore(self.dir)
        first = runner.process_message(self.cfg, self.msg, "7", seen)
        self.assertEqual(first, (1, 1, 0))

        second = runner.process_message(self.cfg, self.msg, "7", seen)
        # 受理 1（＝一度扱った）だが保存はしない。失敗でもない。
        self.assertEqual(second, (1, 0, 0))
        self.assertEqual(len(self._written()), 1, self._written())

    def test_全部が再配達でも既読にして処理済みへ送る(self):
        # 失敗ゼロなので失敗フォルダへ行かない。受信箱にも残さない。
        seen = SeenStore(self.dir)
        runner.process_message(self.cfg, self.msg, "7", seen)
        accepted, saved, failed = runner.process_message(
            self.cfg, self.msg, "7", seen
        )
        self.assertGreater(accepted, 0)  # → elif accepted: 処理済みへ
        self.assertEqual((saved, failed), (0, 0))

    def test_再起動をまたいでも二度は置かない(self):
        # 台帳はファイルなので、コンテナが入れ替わっても効く
        runner.process_message(self.cfg, self.msg, "7", SeenStore(self.dir))
        runner.process_message(self.cfg, self.msg, "7", SeenStore(self.dir))
        self.assertEqual(len(self._written()), 1, self._written())

    def test_uidが違えば同じ添付でも置く(self):
        # 同じ注文書を客が本当に 2 通送ってくることがある = 別の取込
        seen = SeenStore(self.dir)
        runner.process_message(self.cfg, self.msg, "7", seen)
        runner.process_message(self.cfg, self.msg, "8", seen)
        self.assertEqual(len(self._written()), 2, self._written())

    def test_書けなかった添付は覚えない(self):
        # 半分成功の残りを次に取りこぼさないため（記録は保存できた分だけ）
        seen = SeenStore(self.dir)
        with mock.patch.object(
            runner, "write_to_intake", side_effect=runner.IntakeWriteError("boom")
        ):
            self.assertEqual(
                runner.process_message(self.cfg, self.msg, "7", seen), (1, 0, 1)
            )
        self.assertFalse(seen.entries)

    def test_台帳を渡さなければ従来どおり(self):
        # seen=None は導入前と同じ挙動（毎回置く）
        runner.process_message(self.cfg, self.msg, "7")
        runner.process_message(self.cfg, self.msg, "7")
        self.assertEqual(len(self._written()), 2, self._written())


class TestSenderAllowed(unittest.TestCase):
    def test_未設定なら全部通す(self):
        self.assertTrue(cfg_for("/tmp").sender_allowed("anyone@x.jp"))

    def test_ドメインでも書ける(self):
        c = cfg_for("/tmp", allow_from=("@example.co.jp",))
        self.assertTrue(c.sender_allowed("田中 <tanaka@example.co.jp>"))
        self.assertFalse(c.sender_allowed("spam@other.jp"))


if __name__ == "__main__":
    unittest.main()
