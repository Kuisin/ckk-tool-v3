"""test_parts.py — 添付の選別。依存ゼロ（python -m unittest discover tests）。

本命は「HTML 署名のロゴを落とす」ケース。ここを通すと、1 通ごとに会社ロゴが
注文請書として採番され、人が消して回ることになる。
"""

import unittest
from email import message_from_string

from gateway.parts import (
    decode_filename,
    inbound_filename,
    iter_attachments,
    sender_tag,
)

PDF_B64 = "JVBERi0xLjQK"  # "%PDF-1.4\n"


def mail(body: str) -> "object":
    return message_from_string(body)


SIMPLE = f"""From: tanaka@example.co.jp
Subject: =?UTF-8?B?44GU5rOo5paH?=
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b1"

--b1
Content-Type: text/plain; charset=UTF-8

お世話になります。
--b1
Content-Type: application/pdf; name="order.pdf"
Content-Disposition: attachment; filename="order.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--b1--
"""

# 本命: HTML 署名にロゴが cid: で埋まっているメール
WITH_LOGO = f"""From: sales@example.co.jp
MIME-Version: 1.0
Content-Type: multipart/related; boundary="r1"

--r1
Content-Type: text/html; charset=UTF-8

<p>ご注文です</p><img src="cid:logo123">
--r1
Content-Type: image/png
Content-ID: <logo123>
Content-Disposition: inline; filename="logo.png"
Content-Transfer-Encoding: base64

iVBORw0KGgo=
--r1
Content-Type: application/pdf
Content-Disposition: attachment; filename="注文書.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--r1--
"""

NESTED_TWO = f"""From: a@b.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="m1"

--m1
Content-Type: multipart/alternative; boundary="a1"

--a1
Content-Type: text/plain; charset=UTF-8

本文
--a1
Content-Type: text/html; charset=UTF-8

<p>本文</p>
--a1--
--m1
Content-Type: application/pdf
Content-Disposition: attachment; filename="one.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--m1
Content-Type: application/pdf
Content-Disposition: attachment; filename="two.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--m1--
"""

JUNK = f"""From: a@b.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="j1"

--j1
Content-Type: application/pkcs7-signature; name="smime.p7s"
Content-Disposition: attachment; filename="smime.p7s"
Content-Transfer-Encoding: base64

AAAA
--j1
Content-Type: text/calendar; name="invite.ics"
Content-Disposition: attachment; filename="invite.ics"

BEGIN:VCALENDAR
--j1
Content-Type: application/pdf
Content-Disposition: attachment; filename="real.pdf"
Content-Transfer-Encoding: base64

{PDF_B64}
--j1--
"""

# 古い国産複合機: Content-Disposition が無く name= だけ
LEGACY_NAME = f"""From: mfp@example.co.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="l1"

--l1
Content-Type: application/pdf; name="SCAN0001.PDF"
Content-Transfer-Encoding: base64

{PDF_B64}
--l1--
"""

# ファイル名が一切無い FAX ゲートウェイ
NO_NAME = f"""From: fax@gateway.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="n1"

--n1
Content-Type: application/pdf
Content-Transfer-Encoding: base64

{PDF_B64}
--n1--
"""

ISO2022JP_NAME = f"""From: a@b.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="i1"

--i1
Content-Type: application/pdf
Content-Disposition: attachment; filename="=?ISO-2022-JP?B?GyRCJUYlOSVIGyhCLnBkZg==?="
Content-Transfer-Encoding: base64

{PDF_B64}
--i1--
"""

RFC2231_NAME = f"""From: a@b.jp
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="c1"

--c1
Content-Type: application/pdf
Content-Disposition: attachment; filename*0*=UTF-8''%E6%B3%A8%E6%96%87;
 filename*1*=%E6%9B%B8%2E%70%64%66
Content-Transfer-Encoding: base64

{PDF_B64}
--c1--
"""


class TestSelection(unittest.TestCase):
    def names(self, raw: str) -> list[str]:
        return [a.filename for a in iter_attachments(mail(raw))]

    def test_単純な添付1件(self):
        self.assertEqual(self.names(SIMPLE), ["order.pdf"])

    def test_署名のロゴを落として注文書だけ取る(self):
        # ここが本命。ロゴを通すと毎通ロゴが採番される。
        self.assertEqual(self.names(WITH_LOGO), ["注文書.pdf"])

    def test_入れ子のalternativeを抜けてPDF2件(self):
        self.assertEqual(self.names(NESTED_TWO), ["one.pdf", "two.pdf"])

    def test_署名やカレンダーは落ちる(self):
        self.assertEqual(self.names(JUNK), ["real.pdf"])

    def test_旧式のname属性だけでも受理する(self):
        self.assertEqual(self.names(LEGACY_NAME), ["SCAN0001.PDF"])

    def test_ファイル名が無ければContentTypeから合成する(self):
        names = [a.filename for a in iter_attachments(mail(NO_NAME), uid="42")]
        self.assertEqual(names, ["fax_42_1.pdf"])

    def test_ISO2022JPのファイル名をデコードする(self):
        self.assertEqual(self.names(ISO2022JP_NAME), ["テスト.pdf"])

    def test_RFC2231の分割ファイル名をデコードする(self):
        self.assertEqual(self.names(RFC2231_NAME), ["注文書.pdf"])

    def test_本文だけのメールは0件(self):
        plain = "From: a@b.jp\nContent-Type: text/plain\n\nよろしく\n"
        self.assertEqual(self.names(plain), [])

    def test_中身も取り出せている(self):
        att = next(iter(iter_attachments(mail(SIMPLE))))
        self.assertEqual(att.data, b"%PDF-1.4\n")
        self.assertEqual(att.ext, ".pdf")


class TestFilename(unittest.TestCase):
    def test_送信元をタグ化する(self):
        self.assertEqual(sender_tag("tanaka@example.co.jp"), "tanaka-at-example.co.jp")
        self.assertEqual(
            sender_tag("田中 <tanaka@example.co.jp>"), "tanaka-at-example.co.jp"
        )
        self.assertEqual(sender_tag(None), "unknown")
        self.assertEqual(sender_tag(""), "unknown")

    def test_ORDで始まる名前を作らない(self):
        # ORD- は「採番済みの続き」の目印。付けると別の請書の続きだと誤認される。
        name = inbound_filename("a@b.jp", "ORD-202608-00001-x.pdf")
        self.assertTrue(name.startswith("mail_"))
        self.assertFalse(name.startswith("ORD-"))

    def test_パス区切りと制御文字を落とす(self):
        name = inbound_filename("a@b.jp", "../../etc/passwd.pdf")
        self.assertNotIn("/", name)
        self.assertNotIn("..", name)
        self.assertTrue(name.endswith("passwd.pdf"))

    def test_日本語を含む長い名前をバイト長で切り詰め拡張子を守る(self):
        original = "注文書" * 100 + ".pdf"
        name = inbound_filename("tanaka@example.co.jp", original)
        self.assertTrue(name.endswith(".pdf"))
        self.assertLessEqual(len(name.encode("utf-8")), 120)
        # 途中で切っても壊れた文字にならない
        name.encode("utf-8").decode("utf-8")

    def test_空白はアンダースコアになる(self):
        self.assertTrue(inbound_filename("a@b.jp", "注文書 5.pdf").endswith("注文書_5.pdf"))


if __name__ == "__main__":
    unittest.main()
