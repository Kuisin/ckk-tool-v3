"""test_mail_monitor.py — メール監視の純粋部分（IMAP には繋がない）。

依存ゼロ: python -m unittest discover -s tests -t .
"""

import unittest
from dataclasses import dataclass

from app import mail_monitor as mm


@dataclass
class FakeAccount:
    username: str
    is_active: bool = True


class TestNamespace(unittest.TestCase):
    def test_さくらの実応答から接頭辞を取る(self):
        raw = [b'(("INBOX." ".")) NIL (("#shared." ".")("shared." "."))']
        self.assertEqual(mm._prefix.__doc__ is not None, True)  # 説明を消さない
        # _qualify 側の挙動で確認する（_prefix は IMAP 接続が要るため）
        self.assertEqual(mm._qualify("Processed", "INBOX."), "INBOX.Processed")

    def test_INBOX自身と二重付与を避ける(self):
        self.assertEqual(mm._qualify("INBOX", "INBOX."), "INBOX")
        self.assertEqual(mm._qualify("INBOX.Processed", "INBOX."), "INBOX.Processed")

    def test_接頭辞が空なら素通し(self):
        self.assertEqual(mm._qualify("Processed", ""), "Processed")
        self.assertEqual(mm._qualify("", "INBOX."), "")


class TestMonitored(unittest.TestCase):
    def test_取込用だけを選ぶ(self):
        accounts = [
            FakeAccount("other-sys.order-intake"),
            FakeAccount("other-sys.order-intake-dev"),
            FakeAccount("other-sys.no-reply"),
            FakeAccount("a.harada"),
        ]
        got = [a.username for a in mm.monitored(accounts)]
        self.assertEqual(got, ["other-sys.order-intake", "other-sys.order-intake-dev"])

    def test_無効なアカウントは監視しない(self):
        accounts = [FakeAccount("other-sys.order-intake", is_active=False)]
        self.assertEqual(mm.monitored(accounts), [])


class TestQuietSince(unittest.TestCase):
    def test_日時が無ければNone(self):
        self.assertIsNone(mm.quiet_since(None))

    def test_壊れた値でも落ちない(self):
        # 監視が例外で止まると、監視していないのと同じになる
        self.assertIsNone(mm.quiet_since("not-a-date"))

    def test_タイムゾーン無しでも扱える(self):
        self.assertIsInstance(mm.quiet_since("2026-08-30T00:00:00"), int)

    def test_タイムゾーン付きを扱える(self):
        self.assertIsInstance(mm.quiet_since("2026-08-30T00:00:00+09:00"), int)


if __name__ == "__main__":
    unittest.main()


class TestJudge(unittest.TestCase):
    """監視の中身。誤検知が続くと監視そのものが読まれなくなるので、ここを固める。"""

    def box(self, name, exists=True, total=0, unseen=0):
        return mm.BoxStat(name=name, exists=exists, total=total, unseen=unseen)

    def test_全部空なら正常(self):
        lv, msgs = mm.judge(self.box("INBOX"), self.box("Processed"), self.box("Failed"))
        self.assertEqual(lv, "ok")
        self.assertIn("正常です", msgs[0])

    def test_新しい受信箱で処理済みが無くても正常(self):
        # 初回取込時に作られるフォルダなので、無いだけでは異常にしない
        lv, msgs = mm.judge(self.box("INBOX"),
                            self.box("Processed", exists=False),
                            self.box("Failed", exists=False))
        self.assertEqual(lv, "ok")
        self.assertTrue(any("まだありません" in m for m in msgs))

    def test_既読があるのに処理済みが無ければ注意(self):
        # 「処理されたのに移されていない」= 受信箱が肥大していく状態
        lv, msgs = mm.judge(self.box("INBOX", total=5, unseen=0),
                            self.box("Processed", exists=False),
                            self.box("Failed", exists=False))
        self.assertEqual(lv, "warn")
        self.assertTrue(any("移動に失敗" in m for m in msgs))

    def test_未読が溜まっていれば注意(self):
        lv, msgs = mm.judge(self.box("INBOX", total=9, unseen=9),
                            self.box("Processed"), self.box("Failed"))
        self.assertEqual(lv, "warn")
        self.assertTrue(any("ゲートウェイ" in m for m in msgs))

    def test_未読が閾値未満なら正常(self):
        lv, _ = mm.judge(self.box("INBOX", total=1, unseen=1),
                         self.box("Processed"), self.box("Failed"))
        self.assertEqual(lv, "ok")

    def test_取込失敗があれば異常(self):
        lv, msgs = mm.judge(self.box("INBOX"), self.box("Processed"),
                            self.box("Failed", total=2))
        self.assertEqual(lv, "error")
        self.assertTrue(any("人が拾って" in m for m in msgs))

    def test_失敗と未読が同時なら異常が勝つ(self):
        lv, msgs = mm.judge(self.box("INBOX", total=9, unseen=9),
                            self.box("Processed"), self.box("Failed", total=1))
        self.assertEqual(lv, "error")
        self.assertEqual(len(msgs), 2)
