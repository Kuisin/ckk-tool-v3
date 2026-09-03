/**
 * WorkOrderStripSheets — 指示書ストリップ（帯）の印刷面。
 *
 * 1 枚 = 指示書 1 件の「最小限の要約 + QR」。A4 普通紙に 180×40mm を 6 本
 * （寸法は lib/work-order-strip-sheet.ts）。QR は統一形式 `CKK:WO:<番号>`
 * （lib/qr-payload.ts）で、**URL は入れない** — 長い URL は QR を細かくして
 * 現場の読み取りを落とし、紙が外へ出たときにホスト名を晒すため。
 *
 * 取得とページの器は (print)/production/work-orders/print/page.tsx。
 * ここは純粋な描画だけ（データを渡せば DB 無しでも描ける）。
 */

import { useTranslations } from "next-intl";
import type { WorkOrderStripView } from "@/app/(dashboard)/production/work-orders/data";
import { workOrderTypeLabel } from "@/lib/enum-labels";
import { qrSvg } from "@/lib/qr";
import { encodeQrPayload, QR_KINDS } from "@/lib/qr-payload";
import { A4, chunkForSheets, STRIP_SHEET } from "@/lib/work-order-strip-sheet";
import { workOrderStripPrintStyles } from "./work-order-strip-print-styles";

export function WorkOrderStripSheets({
  strips,
}: {
  strips: WorkOrderStripView[];
}) {
  const tr = useTranslations();
  const sheets = chunkForSheets(strips);
  const { stripWidth, stripHeight, marginX, marginY, qrSize } = STRIP_SHEET;

  return (
    <>
      {strips.length === 0 ? (
        <p className="wo-strip-empty">
          {tr("production.workOrderStripSheets.noWorkOrdersToPrint")}
        </p>
      ) : (
        sheets.map((sheet) => (
          <div className="wo-strip-sheet" key={sheet[0]?.workOrderNumber}>
            {/* 原寸確認用スケール（余白に印字 — 切り取ると残らない）。 */}
            <div className="wo-strip-scale">
              <span className="wo-strip-scale-bar" />
              <span className="wo-strip-scale-label">
                {tr("production.workOrderStripSheets.actualSizeCheck50mm")}
              </span>
            </div>
            <div className="wo-strip-grid">
              {sheet.map((wo) => (
                <div className="wo-strip-cell" key={wo.workOrderNumber}>
                  {/* 十字トンボ（切り取り位置） */}
                  <span className="wo-crop wo-crop-tl" />
                  <span className="wo-crop wo-crop-tr" />
                  <span className="wo-crop wo-crop-bl" />
                  <span className="wo-crop wo-crop-br" />
                  <div className="wo-strip">
                    <div
                      className="wo-strip-qr"
                      // biome-ignore lint/security/noDangerouslySetInnerHtml: 自前生成の静的 SVG（lib/qr.ts）
                      dangerouslySetInnerHTML={{
                        __html: qrSvg(
                          encodeQrPayload(
                            QR_KINDS.WO,
                            String(wo.workOrderNumber),
                          ),
                          { margin: 2 },
                        ),
                      }}
                    />
                    <div className="wo-strip-body">
                      <div className="wo-strip-head">
                        <span className="wo-strip-number">
                          {wo.docNumber} ／ ロット #{wo.workOrderNumber}
                        </span>
                        <span className="wo-strip-type">
                          {workOrderTypeLabel(wo.type, "ja")}
                        </span>
                      </div>
                      <div className="wo-strip-product">{wo.productName}</div>
                      <div className="wo-strip-meta">
                        <span className="wo-strip-qty">
                          予定 {wo.plannedQuantity}
                        </span>
                        {wo.materialCode && (
                          <span className="wo-strip-material">
                            素材 {wo.materialCode}
                          </span>
                        )}
                      </div>
                      <div className="wo-strip-order">
                        {wo.orderLineNumber
                          ? `${wo.orderLineNumber}${wo.customerName ? ` / ${wo.customerName}` : ""}`
                          : tr(
                              "production.workOrderStripSheets.forStockNoOrderLine",
                            )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <style>
        {workOrderStripPrintStyles({
          pageWidthMm: A4.width,
          pageHeightMm: A4.height,
          marginXMm: marginX,
          marginYMm: marginY,
          stripWidthMm: stripWidth,
          stripHeightMm: stripHeight,
          qrSizeMm: qrSize,
        })}
      </style>
    </>
  );
}
