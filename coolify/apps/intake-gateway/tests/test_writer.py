"""test_writer.py — 取込フォルダへの直接書き込み。

守りたいのは 3 点: `.part` を残さないこと、名前が衝突しないこと、
`ORD-` で始まらないこと（採番済みの続きだと誤認されるため）。
"""

import os
import tempfile
import unittest

from gateway.writer import (
    IntakeWriteError,
    ensure_writable,
    is_intake_file,
    unique_name,
    write_to_intake,
)


class TestWriter(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_書けて中身が一致する(self):
        name = write_to_intake(self.dir, "order.pdf", b"%PDF-1.4\n")
        with open(os.path.join(self.dir, name), "rb") as fh:
            self.assertEqual(fh.read(), b"%PDF-1.4\n")

    def test_partを残さない(self):
        write_to_intake(self.dir, "order.pdf", b"x")
        leftovers = [f for f in os.listdir(self.dir) if f.endswith(".part")]
        self.assertEqual(leftovers, [])

    def test_同じ元名を二度書いても上書きしない(self):
        a = write_to_intake(self.dir, "order.pdf", b"one")
        b = write_to_intake(self.dir, "order.pdf", b"two")
        self.assertNotEqual(a, b)
        self.assertEqual(len(os.listdir(self.dir)), 2)

    def test_元の名前が末尾に残る(self):
        name = write_to_intake(self.dir, "注文書 5.pdf", b"x")
        # nextjs-web の sanitizeFileName と同じく空白は _ になる
        self.assertTrue(name.endswith("注文書_5.pdf"), name)

    def test_ORDで始まらない(self):
        name = write_to_intake(self.dir, "ORD-202608-00001-x.pdf", b"x")
        self.assertFalse(name.startswith("ORD-"), name)

    def test_対象外の拡張子は書かずに例外(self):
        with self.assertRaises(IntakeWriteError):
            write_to_intake(self.dir, "note.txt", b"x")
        self.assertEqual(os.listdir(self.dir), [])

    def test_TIFFはそのままでは書けない(self):
        # convert.py で PDF にしてから渡す前提（ポーラーは .tif を拾わない）
        with self.assertRaises(IntakeWriteError):
            write_to_intake(self.dir, "fax.tif", b"II*\x00")

    def test_フォルダ未設定は例外(self):
        with self.assertRaises(IntakeWriteError):
            write_to_intake("", "order.pdf", b"x")

    def test_一意名の形(self):
        name = unique_name("order.pdf")
        stamp, rand, rest = name.split("_", 2)
        self.assertEqual(len(stamp), 15)  # yyyyMMdd-HHmmss
        self.assertEqual(len(rand), 6)
        self.assertEqual(rest, "order.pdf")

    def test_拾える拡張子(self):
        self.assertTrue(is_intake_file("a.PDF"))
        self.assertTrue(is_intake_file("a.jpeg"))
        self.assertFalse(is_intake_file("a.tif"))
        self.assertFalse(is_intake_file("a.pdf.part"))


class TestEnsureWritable(unittest.TestCase):
    def test_書けるフォルダは通る(self):
        with tempfile.TemporaryDirectory() as d:
            ensure_writable(d)

    def test_未設定は例外(self):
        with self.assertRaises(IntakeWriteError):
            ensure_writable("")

    def test_存在しないフォルダは例外(self):
        with self.assertRaises(IntakeWriteError):
            ensure_writable("/nonexistent/intake-dir-xyz")

    def test_書けないフォルダは例外(self):
        # uid/gid ずれの検出。root では権限が効かないので飛ばす。
        if os.geteuid() == 0:
            self.skipTest("root では書き込み権限の検査ができない")
        with tempfile.TemporaryDirectory() as d:
            os.chmod(d, 0o500)
            try:
                with self.assertRaises(IntakeWriteError):
                    ensure_writable(d)
            finally:
                os.chmod(d, 0o700)


if __name__ == "__main__":
    unittest.main()
