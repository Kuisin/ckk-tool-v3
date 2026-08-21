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

import type { WorkOrderStripView } from "@/app/(dashboard)/production/work-orders/data";
import { WORK_ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { qrSvg } from "@/lib/qr";
import { encodeQrPayload, QR_KINDS } from "@/lib/qr-payload";
import { A4, chunkForSheets, STRIP_SHEET } from "@/lib/work-order-strip-sheet";

export function WorkOrderStripSheets({
  strips,
}: {
  strips: WorkOrderStripView[];
}) {
  const sheets = chunkForSheets(strips);
  const { stripWidth, stripHeight, marginX, marginY, qrSize } = STRIP_SHEET;

  return (
    <>
      {strips.length === 0 ? (
        <p className="wo-strip-empty">印刷対象の指示書がありません。</p>
      ) : (
        sheets.map((sheet) => (
          <div className="wo-strip-sheet" key={sheet[0]?.workOrderNumber}>
            {/* 原寸確認用スケール（余白に印字 — 切り取ると残らない）。 */}
            <div className="wo-strip-scale">
              <span className="wo-strip-scale-bar" />
              <span className="wo-strip-scale-label">
                50mm（原寸確認 / 用紙 A4・倍率 100%）
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
                          {WORK_ORDER_TYPE_LABEL[wo.type] ?? wo.type}
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
                          : "在庫向け（注文明細なし）"}
                      </div>
                    </div>
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
         *   margin: 0 はブラウザの URL ヘッダー/フッターも抑止する。
         */
        @page { size: ${A4.width}mm ${A4.height}mm; margin: 0; }

        .wo-strip-root { background: #ffffff; color: #000000; }
        .wo-strip-toolbar { padding: 16px; }
        .wo-strip-empty { padding: 0 16px; color: #666666; font-size: 14px; }

        .wo-strip-sheet {
          position: relative;
          box-sizing: border-box;
          width: ${A4.width}mm;
          height: ${A4.height}mm;
          padding: ${marginY}mm ${marginX}mm;
          margin: 0 auto;
          overflow: hidden;
          background: #ffffff;
        }
        .wo-strip-sheet + .wo-strip-sheet { break-before: page; }

        /* 原寸確認スケール — 上余白に置く（帯の外なので切り取ると消える）。 */
        .wo-strip-scale {
          position: absolute;
          top: 8mm;
          left: ${marginX}mm;
          display: flex;
          align-items: center;
          gap: 2mm;
        }
        .wo-strip-scale-bar {
          display: block;
          width: 50mm;
          height: 1.2mm;
          border: 0.2mm solid #000000;
          border-top: none;
          border-bottom: none;
          background:
            linear-gradient(#000, #000) left / 0.2mm 100% no-repeat,
            linear-gradient(#000, #000) right / 0.2mm 100% no-repeat,
            linear-gradient(#000, #000) center / 100% 0.2mm no-repeat;
        }
        .wo-strip-scale-label { font-size: 2.6mm; color: #666666; }

        .wo-strip-grid {
          display: grid;
          grid-template-columns: ${stripWidth}mm;
          grid-auto-rows: ${stripHeight}mm;
        }
        .wo-strip-cell {
          position: relative;
          width: ${stripWidth}mm;
          height: ${stripHeight}mm;
          break-inside: avoid;
        }

        /* 十字トンボ: 各隅の交点を中心に細い線を引く。 */
        .wo-crop {
          position: absolute;
          width: 4mm;
          height: 4mm;
          background:
            linear-gradient(#999, #999) center / 100% 0.2mm no-repeat,
            linear-gradient(#999, #999) center / 0.2mm 100% no-repeat;
        }
        .wo-crop-tl { top: -2mm; left: -2mm; }
        .wo-crop-tr { top: -2mm; right: -2mm; }
        .wo-crop-bl { bottom: -2mm; left: -2mm; }
        .wo-crop-br { bottom: -2mm; right: -2mm; }

        .wo-strip {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          padding: 3mm 4mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          border: 0.2mm dashed #cccccc; /* 切り取り線の目安 */
        }
        .wo-strip-qr { width: ${qrSize}mm; height: ${qrSize}mm; flex: none; }
        .wo-strip-qr svg { width: 100%; height: 100%; display: block; }

        .wo-strip-body {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }
        .wo-strip-head {
          display: flex;
          align-items: baseline;
          gap: 3mm;
        }
        .wo-strip-number {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 6mm;
          font-weight: 700;
          line-height: 1.1;
        }
        .wo-strip-type {
          font-size: 3mm;
          padding: 0.4mm 1.6mm;
          border: 0.2mm solid #000000;
          border-radius: 1mm;
        }
        .wo-strip-product {
          font-size: 4mm;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .wo-strip-meta { display: flex; gap: 4mm; font-size: 3.2mm; }
        .wo-strip-order {
          font-size: 3.2mm;
          color: #444444;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media print {
          .wo-strip-toolbar { display: none !important; }
          .wo-strip-sheet { margin: 0; }
        }
      `}</style>

      <style>{`

        /*
         * ★ ページサイズは必ず「長さ」で書く（絶対ページボックス = 縮小禁止）。
         *   margin: 0 はブラウザの URL ヘッダー/フッターも抑止する。
         */
        @page { size: ${A4.width}mm ${A4.height}mm; margin: 0; }

        .wo-strip-root { background: #ffffff; color: #000000; }
        .wo-strip-toolbar { padding: 16px; }
        .wo-strip-empty { padding: 0 16px; color: #666666; font-size: 14px; }

        .wo-strip-sheet {
          position: relative;
          box-sizing: border-box;
          width: ${A4.width}mm;
          height: ${A4.height}mm;
          padding: ${marginY}mm ${marginX}mm;
          margin: 0 auto;
          overflow: hidden;
          background: #ffffff;
        }
        .wo-strip-sheet + .wo-strip-sheet { break-before: page; }

        /* 原寸確認スケール — 上余白に置く（帯の外なので切り取ると消える）。 */
        .wo-strip-scale {
          position: absolute;
          top: 8mm;
          left: ${marginX}mm;
          display: flex;
          align-items: center;
          gap: 2mm;
        }
        .wo-strip-scale-bar {
          display: block;
          width: 50mm;
          height: 1.2mm;
          border: 0.2mm solid #000000;
          border-top: none;
          border-bottom: none;
          background:
            linear-gradient(#000, #000) left / 0.2mm 100% no-repeat,
            linear-gradient(#000, #000) right / 0.2mm 100% no-repeat,
            linear-gradient(#000, #000) center / 100% 0.2mm no-repeat;
        }
        .wo-strip-scale-label { font-size: 2.6mm; color: #666666; }

        .wo-strip-grid {
          display: grid;
          grid-template-columns: ${stripWidth}mm;
          grid-auto-rows: ${stripHeight}mm;
        }
        .wo-strip-cell {
          position: relative;
          width: ${stripWidth}mm;
          height: ${stripHeight}mm;
          break-inside: avoid;
        }

        /* 十字トンボ: 各隅の交点を中心に細い線を引く。 */
        .wo-crop {
          position: absolute;
          width: 4mm;
          height: 4mm;
          background:
            linear-gradient(#999, #999) center / 100% 0.2mm no-repeat,
            linear-gradient(#999, #999) center / 0.2mm 100% no-repeat;
        }
        .wo-crop-tl { top: -2mm; left: -2mm; }
        .wo-crop-tr { top: -2mm; right: -2mm; }
        .wo-crop-bl { bottom: -2mm; left: -2mm; }
        .wo-crop-br { bottom: -2mm; right: -2mm; }

        .wo-strip {
          box-sizing: border-box;
          width: 100%;
          height: 100%;
          padding: 3mm 4mm;
          display: flex;
          gap: 4mm;
          align-items: center;
          border: 0.2mm dashed #cccccc; /* 切り取り線の目安 */
        }
        .wo-strip-qr { width: ${qrSize}mm; height: ${qrSize}mm; flex: none; }
        .wo-strip-qr svg { width: 100%; height: 100%; display: block; }

        .wo-strip-body {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }
        .wo-strip-head {
          display: flex;
          align-items: baseline;
          gap: 3mm;
        }
        .wo-strip-number {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 6mm;
          font-weight: 700;
          line-height: 1.1;
        }
        .wo-strip-type {
          font-size: 3mm;
          padding: 0.4mm 1.6mm;
          border: 0.2mm solid #000000;
          border-radius: 1mm;
        }
        .wo-strip-product {
          font-size: 4mm;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .wo-strip-meta { display: flex; gap: 4mm; font-size: 3.2mm; }
        .wo-strip-order {
          font-size: 3.2mm;
          color: #444444;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media print {
          .wo-strip-toolbar { display: none !important; }
          .wo-strip-sheet { margin: 0; }
        }
      `}</style>
    </>
  );
}
