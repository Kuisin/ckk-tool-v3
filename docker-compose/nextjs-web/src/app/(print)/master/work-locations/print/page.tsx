import { IconLock } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { encodeQrPayload, QR_KINDS } from "@/lib/qr-payload";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/** PDF 保存名が一意になるよう日時入りタイトル（コンテナ TZ=Asia/Tokyo）。 */
export function generateMetadata() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: `作業場所QR印刷_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`,
  };
}

/**
 * 作業場所 QR ラベル印刷シート（MS0D, /master/work-locations/print?ids=...）。
 *
 * 機械・エリアに貼るラベル。QR は統一形式 `CKK:LOC:<作業場所コード>`
 * （lib/qr-payload.ts）— キオスクの工程実行画面で読むと、その作業実績の
 * 作業場所を上書きできる。
 *
 * ★ 原寸の担保はカード印刷（SY08）と同じ — `@page` を **長さ**で書いた
 *   絶対ページボックスにする（キーワード指定は "scalable" で縮む）。
 *   ブラウザ印刷が主経路（lib/kiosk-card-sheet.ts の解説を参照）。
 *
 * 用紙は普通紙 A4 を想定し、はさみ断裁用の十字トンボを付ける
 * （名刺用紙のような定位置ミシン目は前提にしない）。
 */

// ラベル寸法（mm）。A4 に 2 列 × 4 行 = 8 枚/頁。
const A4 = { width: 210, height: 297 } as const;
const LABEL = { width: 85, height: 60, cols: 2, rows: 4 } as const;
const LABELS_PER_PAGE = LABEL.cols * LABEL.rows;
const MARGIN_X = (A4.width - LABEL.width * LABEL.cols) / 2; // 20mm
const MARGIN_Y = (A4.height - LABEL.height * LABEL.rows) / 2; // 28.5mm

export default async function WorkLocationsPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const authz = await checkPermission("master", "READ");
  if (!authz.ok) {
    return <EmptyState icon={<IconLock size={28} />} message={authz.error} />;
  }

  const { ids: idsRaw } = await searchParams;
  const ids = (idsRaw ?? "")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 200);
  const locations = await prisma.workLocation.findMany({
    where: { id: { in: ids } },
    include: { group: { select: { name: true } } },
    orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  const labels = locations.map((l) => ({
    id: l.id,
    code: l.code,
    name: localized(l.name as LocalizedText | null),
    groupName: localized(l.group.name as LocalizedText | null),
  }));

  const sheets: (typeof labels)[] = [];
  for (let i = 0; i < labels.length; i += LABELS_PER_PAGE) {
    sheets.push(labels.slice(i, i + LABELS_PER_PAGE));
  }

  return (
    <div className="wl-print-root">
      <PrintToolbar count={labels.length} />

      {labels.length === 0 ? (
        <p className="wl-print-empty">印刷対象の作業場所がありません。</p>
      ) : (
        sheets.map((sheet) => (
          <div className="wl-print-sheet" key={sheet[0]?.id}>
            {/* 原寸確認用スケール（余白部分に印字 — 断裁後は残らない）。 */}
            <div className="wl-print-scale">
              <span className="wl-print-scale-bar" />
              <span className="wl-print-scale-label">
                50mm（原寸確認 / 用紙 A4・倍率 100%）
              </span>
            </div>
            <div className="wl-print-grid">
              {sheet.map((label) => (
                <div className="wl-print-cell" key={label.id}>
                  <span className="wl-crop wl-crop-tl" />
                  <span className="wl-crop wl-crop-tr" />
                  <span className="wl-crop wl-crop-bl" />
                  <span className="wl-crop wl-crop-br" />
                  <div className="wl-print-label">
                    <div
                      className="wl-print-qr"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                      dangerouslySetInnerHTML={{
                        __html: qrSvg(
                          encodeQrPayload(QR_KINDS.WORK_LOCATION, label.code),
                          { margin: 2 },
                        ),
                      }}
                    />
                    <div className="wl-print-body">
                      <span className="wl-print-group">{label.groupName}</span>
                      <span className="wl-print-name">{label.name}</span>
                      <span className="wl-print-code">{label.code}</span>
                      <span className="wl-print-hint">
                        作業場所QR — 工程実行画面で読み取り
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <style>{`
        /* ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。 */
        @page { size: ${A4.width}mm ${A4.height}mm; margin: 0; }

        .wl-print-root { background: #ffffff; color: #000000; }
        .wl-print-toolbar { padding: 16px; }
        .wl-print-empty { padding: 0 16px; color: #666666; font-size: 14px; }

        .wl-print-sheet {
          position: relative;
          box-sizing: border-box;
          width: ${A4.width}mm;
          height: ${A4.height}mm;
          padding: ${MARGIN_Y}mm ${MARGIN_X}mm;
          margin: 0 auto;
          overflow: hidden;
          background: #ffffff;
        }
        .wl-print-sheet + .wl-print-sheet { break-before: page; }

        .wl-print-grid {
          display: grid;
          grid-template-columns: repeat(${LABEL.cols}, ${LABEL.width}mm);
          grid-auto-rows: ${LABEL.height}mm;
        }
        .wl-print-cell {
          position: relative;
          width: ${LABEL.width}mm;
          height: ${LABEL.height}mm;
          break-inside: avoid;
        }
        .wl-print-label {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          padding: 5mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          overflow: hidden;
        }

        /* 十字トンボ（はさみ断裁の目印。SY08 と同じ描き方）。 */
        .wl-crop { position: absolute; width: 0; height: 0; }
        .wl-crop::before,
        .wl-crop::after { content: ""; position: absolute; background: #888888; }
        .wl-crop::before { width: 6mm; height: 0.2mm; left: -3mm; top: -0.1mm; }
        .wl-crop::after { width: 0.2mm; height: 6mm; left: -0.1mm; top: -3mm; }
        .wl-crop-tl { top: 0; left: 0; }
        .wl-crop-tr { top: 0; left: ${LABEL.width}mm; }
        .wl-crop-bl { top: ${LABEL.height}mm; left: 0; }
        .wl-crop-br { top: ${LABEL.height}mm; left: ${LABEL.width}mm; }

        .wl-print-scale {
          position: absolute;
          top: 12mm;
          left: ${MARGIN_X}mm;
          display: flex;
          align-items: center;
          gap: 2mm;
          color: #999999;
          font-size: 5pt;
          line-height: 1;
        }
        .wl-print-scale-bar {
          display: block;
          width: 50mm;
          height: 1.5mm;
          border-left: 0.2mm solid #999999;
          border-right: 0.2mm solid #999999;
          border-bottom: 0.2mm solid #999999;
        }

        .wl-print-qr { flex-shrink: 0; }
        .wl-print-qr svg { width: 40mm; height: 40mm; display: block; }
        .wl-print-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1.5mm;
        }
        .wl-print-group { font-size: 8pt; color: #444444; overflow-wrap: anywhere; }
        .wl-print-name { font-size: 14pt; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
        .wl-print-code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 9pt;
          color: #333333;
          overflow-wrap: anywhere;
        }
        .wl-print-hint { font-size: 5.5pt; color: #999999; }

        @media screen {
          .wl-print-root { background: #f1f3f5; padding-bottom: 24px; }
          .wl-print-sheet {
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.25);
            margin-bottom: 16px;
          }
        }
        @media print {
          .wl-print-toolbar { display: none; }
          .wl-print-sheet { box-shadow: none; margin: 0 auto; }
        }
      `}</style>
    </div>
  );
}
