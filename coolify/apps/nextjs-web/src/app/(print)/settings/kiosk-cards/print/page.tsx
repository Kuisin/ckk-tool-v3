import { IconLock } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCode } from "@/lib/crockford";
import { fetchKioskCardsForPrint } from "@/lib/kiosk-admin";
import { A4, CARD_SHEET, CARDS_PER_PAGE } from "@/lib/kiosk-card-sheet";
import { useElevation } from "@/lib/privileged-access";
import { qrSvg } from "@/lib/qr";
import { encodeQrPayload, QR_KINDS } from "@/lib/qr-payload";
import { kioskCardPrintStyles } from "./print-styles";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/** PDF 保存名が一意になるよう日時入りタイトル（コンテナ TZ=Asia/Tokyo）。 */
export function generateMetadata() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: `QRカード印刷_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`, // i18n-ignore — api/pdf/kiosk-cards/route.ts と同じファイル名規約
  };
}

/**
 * QRカード印刷シート（SY08, /settings/kiosk-cards/print?ids=...）。
 *
 * (print) ルートグループ配下 — ダッシュボードシェル（ヘッダー/フッター）無しで
 * 印刷用のカード面のみを描画する。QR ペイロードは統一形式
 * `CKK:CARD:ABCD-EFGH-JKLM-NPQR`（lib/qr-payload.ts）— 1 つのリーダーで
 * 指示書ストリップなど他の QR と見分けられるようにするため。既に配ってある
 * 素の 16 桁カードもキオスク側が従来解釈で受け付ける（後方互換）。
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
  const tr = await getTranslations();
  // QR = 認証情報そのものを紙にする操作。/api/pdf/kiosk-cards と同じ門
  // （kiosk_card READ + 特権操作 kiosk_card.print の承認）を通す — 描画 1 回 =
  // useElevation 1 回で、PDF ルートの使用回数の数え方と揃える。
  const gate = await useElevation("kiosk_card.print");
  if (!gate.ok) {
    return <EmptyState icon={<IconLock size={28} />} message={gate.error} />;
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
        <p className="kiosk-print-empty">
          {tr("settings.kioskCards.thereAreNoCardsToPrint")}
        </p>
      ) : (
        sheets.map((sheet) => (
          <div className="kiosk-print-sheet" key={sheet[0]?.id}>
            {/* 原寸確認用スケール（余白部分に印字 — 断裁後は残らない）。
                定規で 50mm あれば倍率 100%。 */}
            <div className="kiosk-print-scale">
              <span className="kiosk-print-scale-bar" />
              <span className="kiosk-print-scale-label">
                {tr("common.n50mmActualSizeCheckA4Paper")}
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
                        __html: qrSvg(
                          encodeQrPayload(QR_KINDS.CARD, formatCode(card.id)),
                          { margin: 2 },
                        ),
                      }}
                    />
                    <div className="kiosk-print-card-head">
                      <span className="kiosk-print-company">
                        {/* i18n-ignore — 固有名詞（社名） */}
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

      <style>
        {kioskCardPrintStyles({
          pageWidthMm: A4.width,
          pageHeightMm: A4.height,
          marginXMm: marginX,
          marginYMm: marginY,
          cols,
          cardWidthMm: cardWidth,
          cardHeightMm: cardHeight,
        })}
      </style>
    </div>
  );
}
