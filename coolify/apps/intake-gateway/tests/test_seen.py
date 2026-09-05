"""test_seen.py — 取込済み台帳（重複取込の防止）。

固定したいのは 4 点:
  1. 同じ (uid, バイト列) は 2 度目に has() が真
  2. **uid が違えば別物**（同じ注文書を客が本当に 2 通送ってくることがある）
  3. 再起動をまたいで残る（ファイルから読み直せる）
  4. 保持期間を過ぎた記録は刈られる
"""

import json
import os
import tempfile
import unittest

from gateway.seen import RETENTION_SECONDS, SeenStore, attachment_key

PDF = b"%PDF-1.4 order"
OTHER = b"%PDF-1.4 another"


class TestSeenStore(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_置いた添付は次から取込済みになる(self):
        s = SeenStore(self.dir)
        self.assertFalse(s.has("7", PDF))
        s.record("7", PDF)
        self.assertTrue(s.has("7", PDF))

    def test_同じuidでも別のバイト列は別物(self):
        # 1 通に複数添付。前回一部だけ書けた場合に残りを取りこぼさない。
        s = SeenStore(self.dir)
        s.record("7", PDF)
        self.assertFalse(s.has("7", OTHER))

    def test_同じバイト列でもuidが違えば別物(self):
        # 同じ注文書を本当に 2 通送ってくることがある。それは別の取込。
        s = SeenStore(self.dir)
        s.record("7", PDF)
        self.assertFalse(s.has("8", PDF))

    def test_再起動をまたいで残る(self):
        SeenStore(self.dir).record("7", PDF)
        self.assertTrue(SeenStore(self.dir).has("7", PDF))

    def test_台帳は取込フォルダの下のドットディレクトリに置く(self):
        # ポーラー（scanIntakeFolder）から見えない場所であること
        s = SeenStore(self.dir)
        s.record("7", PDF)
        self.assertEqual(os.listdir(self.dir), [".gateway"])
        self.assertTrue(os.path.isfile(s.path))

    def test_保持期間を過ぎた記録は刈られる(self):
        s = SeenStore(self.dir)
        s.record("old", PDF, now=1_000.0)
        s.record("new", OTHER, now=1_000.0 + RETENTION_SECONDS)
        # 「新しいほう」の時点から見ると、古いほうがちょうど期限
        s.prune(now=1_000.0 + RETENTION_SECONDS + 1)
        self.assertFalse(s.has("old", PDF))
        self.assertTrue(s.has("new", OTHER))

    def test_読み込み時にも刈る(self):
        s = SeenStore(self.dir)
        s.record("old", PDF, now=1_000.0)
        reloaded = SeenStore(self.dir, now=1_000.0 + RETENTION_SECONDS + 1)
        self.assertFalse(reloaded.has("old", PDF))

    def test_壊れた台帳は捨てて作り直す(self):
        # 読めないことを理由に取込を止めない（欠落のほうが重い）
        s = SeenStore(self.dir)
        s.record("7", PDF)
        with open(s.path, "w", encoding="utf-8") as fh:
            fh.write("{ これは JSON ではない")
        again = SeenStore(self.dir)
        self.assertFalse(again.has("7", PDF))
        # 壊れていても書けること
        again.record("7", PDF)
        self.assertTrue(SeenStore(self.dir).has("7", PDF))

    def test_形が違う台帳も作り直す(self):
        s = SeenStore(self.dir)
        os.makedirs(s.dir, exist_ok=True)
        with open(s.path, "w", encoding="utf-8") as fh:
            json.dump(["not", "a", "dict"], fh)
        self.assertFalse(SeenStore(self.dir).has("7", PDF))

    def test_保存できなくても例外にしない(self):
        # 取込フォルダが読み取り専用でも、取込そのものは続けたい
        s = SeenStore(self.dir)
        s.path = os.path.join(self.dir, "no", "such", "dir", "seen.json")
        s.dir = "/proc/nonexistent-cannot-create"
        s.record("7", PDF)  # 例外が出ないこと
        self.assertTrue(s.has("7", PDF))  # メモリ上は覚えている

    def test_キーはuidとハッシュ(self):
        self.assertTrue(attachment_key("7", PDF).startswith("7:"))
        self.assertEqual(len(attachment_key("7", PDF).split(":")[1]), 64)


if __name__ == "__main__":
    unittest.main()
