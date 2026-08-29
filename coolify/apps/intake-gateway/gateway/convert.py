"""convert.py — TIFF を PDF にする。

**なぜ要るか** — FAX 由来のメール添付は複数ページ TIFF であることが多い。
nextjs-web の取込フォルダは TIFF を拾わない（INTAKE_FOLDER_EXT に無い）ので、
変換しないと parts.py のフィルタで**黙って捨てられる** — 注文書が消えて
誰も気付かない、という一番まずい失敗になる。

今の運用（人が複合機でスキャンして画面から上げる）では通らない経路だが、
FAX→メールの外部サービスを契約した日に効く。

**img2pdf を使う理由** — FAX の TIFF はたいてい CCITT G4 で、img2pdf は
それを**再エンコードせずそのまま PDF に埋める**。画質の劣化がゼロで、
出来上がりも小さい。Pillow で開いて描き直すと、白黒 2 値が滑らかに潰れる。
img2pdf が扱えない TIFF（LZW や特殊な photometric）だけ Pillow に落とす。
"""

from __future__ import annotations

import io
import logging
import os

log = logging.getLogger(__name__)


class ConvertError(RuntimeError):
    """変換できなかった。"""


def needs_conversion(filename: str) -> bool:
    return os.path.splitext(filename)[1].lower() in (".tif", ".tiff")


def to_pdf_name(filename: str) -> str:
    return f"{os.path.splitext(filename)[0]}.pdf"


def tiff_to_pdf(data: bytes) -> bytes:
    """TIFF（複数ページ可）を PDF にする。"""
    try:
        import img2pdf  # type: ignore[import-untyped]
    except ImportError as e:  # pragma: no cover - 実行環境では必ず入っている
        raise ConvertError("img2pdf が入っていません") from e

    try:
        # 可逆の道。CCITT G4 はそのまま埋め込まれる。
        return img2pdf.convert(data)
    except Exception as e:
        log.info("img2pdf で変換できず Pillow に切り替えます: %s", e)

    try:
        from PIL import Image, ImageSequence  # type: ignore[import-untyped]
    except ImportError as e:  # pragma: no cover
        raise ConvertError("Pillow が入っていません") from e

    try:
        with Image.open(io.BytesIO(data)) as im:
            # 2 値のまま PDF に入れられないモードがあるので RGB に揃える。
            frames = [f.convert("RGB") for f in ImageSequence.Iterator(im)]
            if not frames:
                raise ConvertError("ページがありません")
            out = io.BytesIO()
            frames[0].save(
                out, format="PDF", save_all=True, append_images=frames[1:]
            )
            return out.getvalue()
    except ConvertError:
        raise
    except Exception as e:
        raise ConvertError(f"TIFF を PDF に変換できませんでした: {e}") from e
