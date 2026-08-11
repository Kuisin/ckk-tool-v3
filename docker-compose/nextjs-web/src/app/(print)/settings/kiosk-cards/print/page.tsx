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
            <div className="kiosk-print-card" key={card.id}>
              <div className="kiosk-print-card-head">
                <span className="kiosk-print-company">
                  シー・ケィ・ケー株式会社
                </span>
                <span className="kiosk-print-user">
                  {card.userDisplayName ?? "（未割当）"}
                </span>
              </div>
              <div
                className="kiosk-print-qr"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                dangerouslySetInnerHTML={{
                  __html: qrSvg(formatCode(card.id), { margin: 2 }),
                }}
              />
              <div className="kiosk-print-id">{formatCode(card.id)}</div>
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
        .kiosk-print-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, 86mm);
          gap: 6mm;
        }
        /* カード面: クレジットカードサイズ（85.6 × 54 mm）相当 */
        .kiosk-print-card {
          width: 86mm;
          height: 54mm;
          border: 1px dashed #999999;
          border-radius: 3mm;
          box-sizing: border-box;
          padding: 4mm;
          display: grid;
          grid-template-columns: 1fr auto;
          grid-template-rows: 1fr auto;
          column-gap: 3mm;
          break-inside: avoid;
          page-break-inside: avoid;
          overflow: hidden;
        }
        .kiosk-print-card-head {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2mm;
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
        .kiosk-print-qr { grid-row: 1 / span 2; align-self: center; }
        .kiosk-print-qr svg {
          width: 34mm;
          height: 34mm;
          display: block;
        }
        .kiosk-print-id {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 7pt;
          color: #666666;
          align-self: end;
        }
        @media print {
          .kiosk-print-toolbar { display: none; }
          .kiosk-print-root { padding: 0; }
          .kiosk-print-card { border-color: #bbbbbb; }
        }
        @page { margin: 10mm; }
      `}</style>
    </div>
  );
}
