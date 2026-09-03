import { IconLock } from "@tabler/icons-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { type LocalizedText, localized } from "@/lib/format";
import { qrSvg } from "@/lib/qr";
import { encodeQrPayload, QR_KINDS } from "@/lib/qr-payload";
import { workLocationPrintStyles } from "./print-styles";
import { PrintToolbar } from "./print-toolbar";

export const dynamic = "force-dynamic";

/** PDF 保存名が一意になるよう日時入りタイトル（コンテナ TZ=Asia/Tokyo）。 */
export function generateMetadata() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: `作業場所QR印刷_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`, // i18n-ignore — api/pdf/kiosk-cards/route.ts と同じファイル名規約
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
  const tr = await getTranslations();
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
        <p className="wl-print-empty">
          {tr("master.workLocations.thereAreNoWorkLocationsTo")}
        </p>
      ) : (
        sheets.map((sheet) => (
          <div className="wl-print-sheet" key={sheet[0]?.id}>
            {/* 原寸確認用スケール（余白部分に印字 — 断裁後は残らない）。 */}
            <div className="wl-print-scale">
              <span className="wl-print-scale-bar" />
              <span className="wl-print-scale-label">
                {tr("common.n50mmActualSizeCheckA4Paper")}
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
                        {tr("master.workLocations.workLocationQrScannedOnThe")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <style>
        {workLocationPrintStyles({
          pageWidthMm: A4.width,
          pageHeightMm: A4.height,
          marginXMm: MARGIN_X,
          marginYMm: MARGIN_Y,
          cols: LABEL.cols,
          labelWidthMm: LABEL.width,
          labelHeightMm: LABEL.height,
        })}
      </style>
    </div>
  );
}
