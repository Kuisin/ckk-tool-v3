"""test_convert.py — TIFF → PDF。

img2pdf / Pillow が入っていない環境（素の python -m unittest）では飛ばす。
コンテナの中では必ず走る。
"""

import io
import unittest

try:
    import img2pdf  # noqa: F401
    from PIL import Image

    HAVE_DEPS = True
except ImportError:  # pragma: no cover
    HAVE_DEPS = False

from gateway.convert import ConvertError, needs_conversion, to_pdf_name


class TestNaming(unittest.TestCase):
    def test_変換対象の判定(self):
        self.assertTrue(needs_conversion("fax.tif"))
        self.assertTrue(needs_conversion("FAX.TIFF"))
        self.assertFalse(needs_conversion("order.pdf"))

    def test_拡張子の付け替え(self):
        self.assertEqual(to_pdf_name("fax.TIF"), "fax.pdf")
        self.assertEqual(to_pdf_name("注文書.tiff"), "注文書.pdf")


def _fax_tiff(pages: int = 2) -> bytes:
    """実物の FAX と同じ CCITT G4・標準幅 1728px の複数ページ TIFF。"""
    imgs = []
    for i in range(pages):
        im = Image.new("1", (1728, 1100), 1)
        for y in range(100 * (i + 1), 100 * (i + 1) + 40):
            for x in range(100, 900):
                im.putpixel((x, y), 0)
        imgs.append(im)
    buf = io.BytesIO()
    imgs[0].save(
        buf,
        format="TIFF",
        save_all=True,
        append_images=imgs[1:],
        compression="group4",
    )
    return buf.getvalue()


@unittest.skipUnless(HAVE_DEPS, "img2pdf / Pillow が無い環境ではスキップ")
class TestConvert(unittest.TestCase):
    def test_複数ページのG4TIFFをPDFにする(self):
        from gateway.convert import tiff_to_pdf

        pdf = tiff_to_pdf(_fax_tiff(2))
        self.assertTrue(pdf.startswith(b"%PDF"))

    def test_G4は再エンコードせずそのまま埋め込む(self):
        # img2pdf を選んだ理由そのもの。Pillow で描き直すと 2 値が潰れる。
        from gateway.convert import tiff_to_pdf

        self.assertIn(b"CCITTFaxDecode", tiff_to_pdf(_fax_tiff(1)))

    def test_壊れた入力はConvertError(self):
        # 例外を投げっぱなしにするとメール 1 通ごと落ちる
        from gateway.convert import tiff_to_pdf

        with self.assertRaises(ConvertError):
            tiff_to_pdf(b"not a tiff at all")


if __name__ == "__main__":
    unittest.main()
