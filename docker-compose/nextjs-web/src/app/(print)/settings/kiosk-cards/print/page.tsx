import { IconLock } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { checkPermission } from "@/lib/authz";
import { formatCode } from "@/lib/crockford";
import { fetchKioskCardsForPrint } from "@/lib/kiosk-admin";
import { A4, CARD_SHEET, CARDS_PER_PAGE } from "@/lib/kiosk-card-sheet";
import { qrSvg } from "@/lib/qr";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/** PDF 保存名が一意になるよう日時入りタイトル（コンテナ TZ=Asia/Tokyo）。 */
export function generateMetadata() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: `QRカード印刷_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}

/**
 * QRカード印刷シート（SY08, /settings/kiosk-cards/print?ids=...）。
 *
 * (print) ルートグループ配下 — ダッシュボードシェル（ヘッダー/フッター）無しで
 * 印刷用のカード面のみを描画する。QR ペイロードは 4 文字区切りのカード ID
 * （キオスクのログイン読み取りは英数字抽出 → 正規化するのでダッシュ可）。
 *
 * ★ 原寸（91×55mm）の担保 —
 *   `@page { size: 210mm 297mm }` のように **長さで書いたページサイズは
 *   「絶対ページボックス」**で、UA は用紙に合わせて拡大縮小してはならない
 *   （CSS Paged Media / MDN: size）。`A4` や `portrait` のキーワード指定は
 *   逆に "scalable" ＝ 用紙に合わせて縮められてよい、と規定されている。
 *   旧実装はキーワード指定だったため縮小され、名刺がミシン目からずれていた。
 *   Gotenberg PDF 経路（/api/pdf/kiosk-cards）は PDF になった時点で CSS の
 *   絶対指定が効かず、ビューアの「印刷可能領域に合わせる」が支配するため、
 *   **印刷はこのページ（ブラウザ印刷）が主経路**。PDF は保存・配布用に残す。
 *
 * 用紙は A4 名刺用紙 10 面（エーワン等）。カード 91×55mm を隙間なしで
 * 2 列 × 5 行 = 10 枚/頁、位置は 10 面の定位置（左右 14mm / 上下 11mm）。
 * 断裁ガイドは各カード四隅のトリム線交点を中心にした十字線。寸法の定義は
 * lib/kiosk-card-sheet.ts。
 */
export default async function KioskCardsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const authz = await checkPermission("kiosk", "READ");
  if (!authz.ok) {
    return <EmptyState icon={<IconLock size={28} />} message={authz.error} />;
  }

  const { ids: idsRaw } = await searchParams;
  const ids = (idsRaw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z2-9]{16}$/.test(s))
    .slice(0, 100);
  const cards = await fetchKioskCardsForPrint(ids);

  // 10 枚ごとに 1 シート（ページ）へ分割する。
  const sheets: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    sheets.push(cards.slice(i, i + CARDS_PER_PAGE));
  }

  const { cardWidth, cardHeight, cols, marginX, marginY } = CARD_SHEET;

  return (
    <div className="kiosk-print-root">
      {/* 画面表示のみのツールバー（@media print で非表示） */}
      <PrintToolbar
        count={cards.length}
        pdfHref={`/api/pdf/kiosk-cards?ids=${ids.join(",")}&download=1`}
      />

      {cards.length === 0 ? (
        <p className="kiosk-print-empty">印刷対象のカードがありません。</p>
      ) : (
        sheets.map((sheet) => (
          <div className="kiosk-print-sheet" key={sheet[0]?.id}>
            {/* 原寸確認用スケール（余白部分に印字 — 断裁後は残らない）。
                定規で 50mm あれば倍率 100%。 */}
            <div className="kiosk-print-scale">
              <span className="kiosk-print-scale-bar" />
              <span className="kiosk-print-scale-label">
                50mm（原寸確認 / 用紙 A4・倍率 100%）
              </span>
            </div>
            <div className="kiosk-print-grid">
              {sheet.map((card) => (
                <div className="kiosk-print-cell" key={card.id}>
                  {/* 十字トンボ（トリム線の交点を中心に描く） */}
                  <span className="kiosk-crop kiosk-crop-tl" />
                  <span className="kiosk-crop kiosk-crop-tr" />
                  <span className="kiosk-crop kiosk-crop-bl" />
                  <span className="kiosk-crop kiosk-crop-br" />
                  <div className="kiosk-print-card">
                    <div
                      className="kiosk-print-qr"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                      dangerouslySetInnerHTML={{
                        __html: qrSvg(formatCode(card.id), { margin: 2 }),
                      }}
                    />
                    <div className="kiosk-print-card-head">
                      <span className="kiosk-print-company">
                        シー・ケィ・ケー株式会社
                      </span>
                      {card.userDisplayName ? (
                        <span className="kiosk-print-user">
                          {card.userDisplayName}
                        </span>
                      ) : (
                        // 未割当: 割当後に手書きするための記名線のみ
                        <span className="kiosk-print-user-line" />
                      )}
                      {/* カード識別 No.（SY08 一覧のマスク表示末尾と一致） */}
                      <span className="kiosk-print-shortcode">
                        No. {formatCode(card.id).slice(-9)}
                      </span>
                    </div>
                    <div className="kiosk-print-id">{formatCode(card.id)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <style>{`
        /*
         * ★ ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。
         *   size: A4 のようなキーワードは "scalable" で縮小されうる。
         *   margin: 0 はブラウザの URL ヘッダー/フッターも抑止する。
         */
        @page { size: ${A4.width}mm ${A4.height}mm; margin: 0; }

        .kiosk-print-root { background: #ffffff; color: #000000; }
        .kiosk-print-toolbar { padding: 16px; }
        .kiosk-print-empty { padding: 0 16px; color: #666666; font-size: 14px; }

        /* 1 シート = A4 1 ページ。余白は 10 面マルチカードの定位置。 */
        .kiosk-print-sheet {
          position: relative;
          box-sizing: border-box;
          width: ${A4.width}mm;
          height: ${A4.height}mm;
          padding: ${marginY}mm ${marginX}mm;
          margin: 0 auto;
          overflow: hidden;
          background: #ffffff;
        }
        .kiosk-print-sheet + .kiosk-print-sheet { break-before: page; }

        .kiosk-print-grid {
          display: grid;
          grid-template-columns: repeat(${cols}, ${cardWidth}mm);
          grid-auto-rows: ${cardHeight}mm;
        }
        .kiosk-print-cell {
          position: relative;
          width: ${cardWidth}mm;
          height: ${cardHeight}mm;
          break-inside: avoid;
        }
        .kiosk-print-card {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          padding: 5mm 5mm 3.5mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          position: relative;
          overflow: hidden;
        }

        /*
         * 十字トンボ: トリム線の交点（カードの角）を中心に、水平・垂直の線を
         * カード面へ重ねて描く（各方向 3mm = 全長 6mm、太さ 0.2mm）。
         * 隣接セルの十字は同一位置に重なるだけなので二重描画で問題ない。
         */
        .kiosk-crop { position: absolute; width: 0; height: 0; }
        .kiosk-crop::before,
        .kiosk-crop::after { content: ""; position: absolute; background: #888888; }
        .kiosk-crop::before { width: 6mm; height: 0.2mm; left: -3mm; top: -0.1mm; }
        .kiosk-crop::after { width: 0.2mm; height: 6mm; left: -0.1mm; top: -3mm; }
        .kiosk-crop-tl { top: 0; left: 0; }
        .kiosk-crop-tr { top: 0; left: ${cardWidth}mm; }
        .kiosk-crop-bl { top: ${cardHeight}mm; left: 0; }
        .kiosk-crop-br { top: ${cardHeight}mm; left: ${cardWidth}mm; }

        /* 原寸確認スケール — 上余白（断裁で捨てる帯）に薄く印字する。 */
        .kiosk-print-scale {
          position: absolute;
          top: 5.5mm;
          left: ${marginX}mm;
          display: flex;
          align-items: center;
          gap: 2mm;
          color: #999999;
          font-size: 5pt;
          line-height: 1;
        }
        .kiosk-print-scale-bar {
          display: block;
          width: 50mm;
          height: 1.5mm;
          border-left: 0.2mm solid #999999;
          border-right: 0.2mm solid #999999;
          border-bottom: 0.2mm solid #999999;
        }

        .kiosk-print-card-head {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2.5mm;
          min-width: 0;
        }
        .kiosk-print-company { font-size: 8pt; color: #444444; }
        .kiosk-print-user { font-size: 13pt; font-weight: 700; overflow-wrap: anywhere; }
        /* 未割当カード: 割当後に氏名を手書きする記名線 */
        .kiosk-print-user-line { display: block; height: 9mm; border-bottom: 0.35mm solid #333333; }
        /* カード識別 No.（SY08 一覧の表示末尾と一致 — 整理・照合用） */
        .kiosk-print-shortcode {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10pt;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .kiosk-print-qr { flex-shrink: 0; }
        .kiosk-print-qr svg { width: 36mm; height: 36mm; display: block; }
        .kiosk-print-id {
          position: absolute;
          right: 5mm;
          bottom: 2.5mm;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 6.5pt;
          color: #777777;
        }

        /* 画面では用紙の外形が分かるように影だけ足す（印刷では消す）。 */
        @media screen {
          .kiosk-print-root { background: #f1f3f5; padding-bottom: 24px; }
          .kiosk-print-sheet {
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
            margin-bottom: 16px;
          }
        }
        @media print {
          .kiosk-print-toolbar { display: none; }
          .kiosk-print-sheet { box-shadow: none; margin: 0 auto; }
        }
      `}</style>
    </div>
  );
}
