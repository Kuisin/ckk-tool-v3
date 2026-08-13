import { IconLock } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { checkPermission } from "@/lib/authz";
import { formatCode } from "@/lib/crockford";
import { fetchKioskCardsForPrint } from "@/lib/kiosk-admin";
import { qrSvg } from "@/lib/qr";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/**
 * QRカード印刷シート（SY08, /settings/kiosk-cards/print?ids=...）。
 *
 * (print) ルートグループ配下 — ダッシュボードシェル（ヘッダー/フッター）無しで
 * 印刷用のカード面のみを描画する。QR ペイロードは 4 文字区切りのカード ID
 * （キオスクのログイン読み取りは英数字抽出 → 正規化するのでダッシュ可）。
 *
 * 用紙は A4（縦）、カードは日本名刺サイズ 91×55mm を 2 列 × 4 行 = 8 枚/頁。
 * 断裁ガイドはカード外側のコーナートンボのみ（トリム線から 1mm 逃がし）—
 * トンボに合わせて直線裁ちすればカード面に枠線が残らない。画面表示時のみ
 * 薄い破線でトリム箱をプレビューし、印刷時は消す。
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

  return (
    <div className="kiosk-print-root">
      {/* 画面表示のみのツールバー（@media print で非表示） */}
      <PrintToolbar count={cards.length} />

      {cards.length === 0 ? (
        <p className="kiosk-print-empty">印刷対象のカードがありません。</p>
      ) : (
        <div className="kiosk-print-grid">
          {cards.map((card) => (
            <div className="kiosk-print-cell" key={card.id}>
              {/* コーナートンボ（カード外側 — 断裁後にカード面へ残らない） */}
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
                  {/* カード識別 No.（SY08 一覧のマスク表示末尾 8 文字と一致） */}
                  <span className="kiosk-print-shortcode">
                    No. {formatCode(card.id).slice(-9)}
                  </span>
                </div>
                <div className="kiosk-print-id">{formatCode(card.id)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .kiosk-print-root {
          padding: 16px;
          background: #ffffff;
          color: #000000;
          min-height: 100dvh;
        }
        .kiosk-print-empty {
          color: #666666;
          font-size: 14px;
        }
        /*
         * A4 縦（余白 10mm → 印字域 190×277mm）に 91mm × 2 列 + 列間 8mm = 190mm、
         * 55mm × 4 行 + 行間 8mm。トンボは各セルの外側 1〜3.5mm に描くので
         * 8mm の間隔内で隣のセルのトンボと交差しない。
         */
        .kiosk-print-grid {
          display: grid;
          grid-template-columns: repeat(2, 91mm);
          gap: 8mm;
          justify-content: center;
        }
        /* トリム箱 = 日本名刺サイズ（91 × 55 mm）。枠線は印刷しない */
        .kiosk-print-cell {
          position: relative;
          width: 91mm;
          height: 55mm;
          break-inside: avoid;
          page-break-inside: avoid;
          /* 画面プレビュー時のみ切り取り線を可視化（印刷時は消す） */
          outline: 1px dashed #cccccc;
        }
        .kiosk-print-card {
          width: 100%;
          height: 100%;
          box-sizing: border-box;
          padding: 5mm 5mm 3.5mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          position: relative;
          overflow: hidden;
        }
        /*
         * コーナートンボ: トリム線の延長上・カードの外側（1mm 逃がし + 2.5mm 線）。
         * ::before = 水平線（上下トリム線の延長）、::after = 垂直線（左右トリム線の延長）。
         */
        .kiosk-crop {
          position: absolute;
          width: 0;
          height: 0;
        }
        .kiosk-crop::before,
        .kiosk-crop::after {
          content: "";
          position: absolute;
          background: #000000;
        }
        .kiosk-crop::before { width: 2.5mm; height: 0.25mm; }
        .kiosk-crop::after { width: 0.25mm; height: 2.5mm; }
        .kiosk-crop-tl { top: 0; left: 0; }
        .kiosk-crop-tl::before { right: 1mm; top: -0.125mm; }
        .kiosk-crop-tl::after { bottom: 1mm; left: -0.125mm; }
        .kiosk-crop-tr { top: 0; right: 0; }
        .kiosk-crop-tr::before { left: 1mm; top: -0.125mm; }
        .kiosk-crop-tr::after { bottom: 1mm; right: -0.125mm; }
        .kiosk-crop-bl { bottom: 0; left: 0; }
        .kiosk-crop-bl::before { right: 1mm; bottom: -0.125mm; }
        .kiosk-crop-bl::after { top: 1mm; left: -0.125mm; }
        .kiosk-crop-br { bottom: 0; right: 0; }
        .kiosk-crop-br::before { left: 1mm; bottom: -0.125mm; }
        .kiosk-crop-br::after { top: 1mm; right: -0.125mm; }
        .kiosk-print-card-head {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2.5mm;
          min-width: 0;
        }
        .kiosk-print-company {
          font-size: 8pt;
          color: #444444;
        }
        .kiosk-print-user {
          font-size: 13pt;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        /* 未割当カード: 割当後に氏名を手書きする記名線 */
        .kiosk-print-user-line {
          display: block;
          height: 9mm;
          border-bottom: 0.35mm solid #333333;
        }
        /* カード識別 No.（SY08 一覧の表示末尾と一致 — 整理・照合用） */
        .kiosk-print-shortcode {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 10pt;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
        .kiosk-print-qr { flex-shrink: 0; }
        .kiosk-print-qr svg {
          width: 36mm;
          height: 36mm;
          display: block;
        }
        .kiosk-print-id {
          position: absolute;
          right: 5mm;
          bottom: 2.5mm;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 6.5pt;
          color: #777777;
        }
        @media print {
          .kiosk-print-toolbar { display: none; }
          /* @page margin: 0 でブラウザの URL ヘッダー/フッターを抑止し、
             余白は body 側 padding で 10mm 確保する */
          .kiosk-print-root { padding: 10mm; min-height: 0; }
          /* 印刷ではトリム箱の枠線を出さない — 断裁ガイドはトンボのみ */
          .kiosk-print-cell { outline: none; }
        }
        @page { size: A4 portrait; margin: 0; }
      `}</style>
    </div>
  );
}
