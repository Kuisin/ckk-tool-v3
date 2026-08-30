"""test_mailbox.py — メールボックス名の名前空間。

実機（Sakura / Courier 系）で `Processed` を作ろうとして
`Invalid mailbox name.` になり、処理済みメールが受信箱に溜まり続けた。
NAMESPACE を聞いて `INBOX.` を足せば通る。設定に `INBOX.` を書かせると
Dovecot 系に持っていけなくなるので、コード側で吸収する。
"""

import unittest

from gateway.mailbox import parse_namespace_prefix, qualify_box


class TestParseNamespacePrefix(unittest.TestCase):
    def test_Sakuraの実応答(self):
        # 実機から取得したそのままの応答
        raw = [b'(("INBOX." ".")) NIL (("#shared." ".")("shared." "."))']
        self.assertEqual(parse_namespace_prefix(raw), "INBOX.")

    def test_Dovecot風の空接頭辞(self):
        self.assertEqual(parse_namespace_prefix([b'(("" "/")) NIL NIL']), "")

    def test_bytesでもstrでも読める(self):
        self.assertEqual(parse_namespace_prefix(b'(("INBOX." ".")) NIL NIL'), "INBOX.")
        self.assertEqual(parse_namespace_prefix('(("INBOX." ".")) NIL NIL'), "INBOX.")

    def test_読めない応答は空(self):
        # 空を返す = 何も足さない = 従来どおりの挙動に落ちる
        for bad in (None, "", b"", [], "NIL", ["garbage"]):
            self.assertEqual(parse_namespace_prefix(bad), "")


class TestQualifyBox(unittest.TestCase):
    def test_接頭辞を足す(self):
        self.assertEqual(qualify_box("Processed", "INBOX."), "INBOX.Processed")
        self.assertEqual(qualify_box("Failed", "INBOX."), "INBOX.Failed")

    def test_INBOX自身には足さない(self):
        self.assertEqual(qualify_box("INBOX", "INBOX."), "INBOX")

    def test_既に接頭辞付きなら二重にしない(self):
        self.assertEqual(qualify_box("INBOX.Processed", "INBOX."), "INBOX.Processed")

    def test_接頭辞が空なら素通し(self):
        self.assertEqual(qualify_box("Processed", ""), "Processed")

    def test_空名は空のまま(self):
        # 空 = 「移動しない」の意味なので、勝手に INBOX. を作らない
        self.assertEqual(qualify_box("", "INBOX."), "")


if __name__ == "__main__":
    unittest.main()
