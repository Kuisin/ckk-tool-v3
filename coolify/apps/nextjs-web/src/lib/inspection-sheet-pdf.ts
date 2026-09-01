import "server-only";

/**
 * inspection-sheet-pdf.ts — 検査表 PDF（inspection-sheet.html）のデータ組み立て。
 *
 * 空欄シート（テンプレートから現場メモ用）と記入済みシート（検査記録の結果
 * 確認用）の両モードを同じテンプレートで描画する。テンプレートの
 * `{{#each}}` は配列丸ごとのループしか持てないため、可変列数（項目数・
 * サンプル数）のグリッドはここで完成した HTML 片として組み立て、
 * `{{grid_html}}` 等に素の HTML として差し込む（doc_qr と同じ方式）。
 * ユーザー入力由来の文字列はすべて esc() で HTML エスケープする。
 *
 * VALUES（実測値）記録方式は旧 FileMaker 帳票（製品検査記録）のグリッド
 * ——列=検査項目・行=基本値/目標値/公差Top/Bottom/上限/下限+サンプル——を
 * 再現する（dimensionalGridHtml）。COUNTS（合格数のみ）は列の概念に馴染まない
 * ため、従来どおり項目ごとの行テーブル（countsTableHtml）のまま。
 */

import { inspectionItemTypeLabel } from "@/lib/enum-labels";
import type { LocalizedText } from "@/lib/format";
import { localized } from "@/lib/format";
import {
  acceptLabel,
  formatCounts,
  formatSampleValue,
  goalLabel,
  type InspectionItemRecord,
  type InspectionRecordStyle,
  type InspectionSampleNaming,
  type InspectionSampleValue,
  type InspectionSamplingSpec,
  itemSpecFromRow,
  parseStoredSamples,
  requiredSampleCount,
  sampleLabel,
  samplingLabelJa,
} from "@/lib/inspection-core";

export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** 空欄記入線（未確定のメタ欄）。 */
const BLANK = '<span class="blank-line"></span>';

interface TemplateHead {
  code: string;
  version: number;
  name: unknown;
  relatedProcessStep: { name: unknown } | null;
  samplingMode: "ALL" | "PERCENT" | "COUNT";
  samplingValue: unknown; // Prisma Decimal
  recordStyle: InspectionRecordStyle;
  sampleNaming: InspectionSampleNaming;
}

/** inspection_template_items 行（Prisma 由来の全スカラー列 + itemName）。 */
interface ItemRow extends InspectionItemRecord {
  itemName: unknown;
  section: "MEASUREMENT" | "SHAPE";
  measurementEquipment: string | null;
  nominalValue: unknown; // Prisma Decimal
  toleranceTopDelta: unknown;
  toleranceBottomDelta: unknown;
}

const num = (v: unknown): number | null => (v == null ? null : Number(v));
const fmtNum = (v: unknown): string => {
  const n = num(v);
  return n == null ? "—" : String(n);
};

/** 空欄シートの実測値セル数（要求数がそれ以上でも欄はここまで）。 */
const BLANK_CELL_CAP = 10;
/** 抜取指定なし（全数など数が出ない）ときの既定セル数。 */
const BLANK_CELL_DEFAULT = 3;

function itemBase(item: ItemRow) {
  const spec = itemSpecFromRow(item);
  return {
    spec,
    name: esc(localized(item.itemName as LocalizedText | null)),
    required_mark: item.isRequired
      ? ' <span class="pass-mark fail">*</span>'
      : "",
    type_label: esc(inspectionItemTypeLabel(item.inputType, "ja")),
    accept: esc(acceptLabel(spec) ?? "—"),
    goal: esc(goalLabel(spec) ?? "—"),
  };
}

// ── 測定機器コード凡例（旧帳票脚注「検査設備 LE=レーザー…」） ─────────────────

const EQUIPMENT_LEGEND: Record<string, string> = {
  LE: "レーザー",
  PR: "投影機",
  P: "ピック",
  S: "スケール",
  K: "顕微鏡",
  H: "HeliCheck",
  M: "目視",
  N: "ノギス",
  Z: "ZOLLER",
};

/** 実際に使われている機器コードだけを脚注に出す（凡例の水増しを避ける）。 */
export function equipmentLegendNote(items: ItemRow[]): string {
  const codes = [
    ...new Set(
      items
        .map((i) => i.measurementEquipment?.trim())
        .filter((c): c is string => !!c),
    ),
  ];
  if (codes.length === 0) return "";
  const parts = codes.map((c) => `${c}=${EQUIPMENT_LEGEND[c] ?? c}`);
  return ` ／ 検査設備 ${esc(parts.join(" "))}`;
}

// ── COUNTS（合格数のみ）— 項目ごとの行テーブル ───────────────────────────────

/** 空欄シート（メモ用）の COUNTS 項目行。 */
export function blankSheetItems(items: ItemRow[]) {
  return items.map((item) => {
    const base = itemBase(item);
    return {
      ...base,
      values_html:
        '<span class="value-more">検査数</span><span class="value-cell"></span><span class="value-more">合格数</span><span class="value-cell"></span>',
      judge_html: '<span class="judge-blank">合 ・ 否</span>',
    };
  });
}

/** 記入済みシート（結果確認用）の COUNTS 項目行。 */
export function filledSheetItems(
  rows: {
    templateItem: ItemRow;
    measuredValue: string | null;
    measuredValues: unknown;
    inspectedCount: number | null;
    passedCount: number | null;
    isPass: boolean | null;
  }[],
) {
  return rows.map((row) => {
    const base = itemBase(row.templateItem);
    const samples: InspectionSampleValue[] = parseStoredSamples(
      row.measuredValues,
    );
    const values =
      samples.length > 0
        ? samples
        : row.measuredValue != null
          ? [row.measuredValue]
          : [];
    const values_html =
      row.inspectedCount != null || row.passedCount != null
        ? `<span class="value-cell filled">${esc(formatCounts(row.inspectedCount, row.passedCount))}</span>`
        : values.length > 0
          ? values
              .map(
                (s) =>
                  `<span class="value-cell filled">${esc(formatSampleValue(base.spec, s))}</span>`,
              )
              .join("")
          : '<span class="value-more">—</span>';
    const judge_html =
      row.isPass == null
        ? '<span class="judge-blank">—</span>'
        : row.isPass
          ? '<span class="pass-mark pass">合格</span>'
          : '<span class="pass-mark fail">不合格</span>';
    return {
      ...base,
      values_html,
      judge_html,
    };
  });
}

/** COUNTS 項目行 → テーブル HTML（{{#each}} を使わず素の HTML として差し込む）。 */
export function countsTableHtml(
  rows:
    | ReturnType<typeof blankSheetItems>
    | ReturnType<typeof filledSheetItems>,
): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      (r) => `
      <tr>
        <td><span class="item-name">${r.name}</span>${r.required_mark}<br><span class="sub">${r.type_label}</span></td>
        <td>${r.accept}</td>
        <td>${r.goal}</td>
        <td><div class="value-cells">${r.values_html}</div></td>
        <td class="center">${r.judge_html}</td>
      </tr>`,
    )
    .join("");
  return `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 24%">検査項目</th>
          <th style="width: 14%">合格基準</th>
          <th style="width: 12%">目標</th>
          <th>実測値</th>
          <th style="width: 9%" class="center">合否</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;
}

// ── VALUES（実測値）— 旧帳票の寸法測定グリッド（列=項目・行=基本値/目標値/公差/サンプル） ──

interface GridColumn {
  label: string;
  /** item.id → セルの中身（素の HTML。空欄は `.value-cell` span）。 */
  cellByItemId: Record<number, string>;
}

/** 空欄シート用の列（サンプル数ぶん、すべて空欄セル）。 */
export function blankValueColumns(
  items: ItemRow[],
  sampling: InspectionSamplingSpec,
  lotQuantity: number | null,
  sampleNaming: InspectionSampleNaming,
): { columns: GridColumn[]; overflowNote: string } {
  const required = requiredSampleCount(sampling, lotQuantity);
  const n = Math.max(
    1,
    Math.min(required ?? BLANK_CELL_DEFAULT, BLANK_CELL_CAP),
  );
  const columns = Array.from({ length: n }, (_, i) => ({
    label: sampleLabel(i, sampleNaming),
    cellByItemId: Object.fromEntries(
      items.map((it) => [it.id, '<span class="value-cell"></span>']),
    ),
  }));
  const overflowNote =
    required != null && required > BLANK_CELL_CAP ? `…全${required}本` : "";
  return { columns, overflowNote };
}

/** 記入済みシート用の列（実際に記録されたサンプル数ぶん）。 */
export function filledValueColumns(
  rows: {
    templateItem: ItemRow;
    measuredValue: string | null;
    measuredValues: unknown;
  }[],
  items: ItemRow[],
  sampleNaming: InspectionSampleNaming,
): GridColumn[] {
  const specById = new Map(items.map((it) => [it.id, itemSpecFromRow(it)]));
  const samplesByItemId = new Map<number, InspectionSampleValue[]>();
  let maxLen = 0;
  for (const row of rows) {
    const samples = parseStoredSamples(row.measuredValues);
    const values =
      samples.length > 0
        ? samples
        : row.measuredValue != null
          ? [row.measuredValue]
          : [];
    samplesByItemId.set(row.templateItem.id, values);
    maxLen = Math.max(maxLen, values.length);
  }
  return Array.from({ length: maxLen }, (_, i) => ({
    label: sampleLabel(i, sampleNaming),
    cellByItemId: Object.fromEntries(
      items.map((it) => {
        const values = samplesByItemId.get(it.id) ?? [];
        const v = values[i];
        const spec = specById.get(it.id);
        return [
          it.id,
          v != null && spec ? esc(formatSampleValue(spec, v)) : "—",
        ];
      }),
    ),
  }));
}

/**
 * 寸法測定グリッド本体（列=検査項目・行=基本値/目標値/公差Top/Bottom/上限/下限
 * + サンプル）。旧 FileMaker 帳票（製品検査記録）のレイアウトそのもの。
 * NUMBER 以外の項目（真偽・選択・自由記述）は基本値/公差の4行が「—」になる
 * だけで、サンプル行には通常どおり実測値/入力欄が並ぶ。
 */
export function dimensionalGridHtml(
  items: ItemRow[],
  columns: GridColumn[],
): string {
  if (items.length === 0) return "";
  const rows = items.map((it) => ({ item: it, spec: itemSpecFromRow(it) }));

  const headCells = rows
    .map(({ item, spec }) => {
      const equip = item.measurementEquipment?.trim();
      const name =
        esc(localized(item.itemName as LocalizedText | null)) +
        (equip ? `(${esc(equip)})` : "") +
        (item.isRequired ? '<span class="pass-mark fail">*</span>' : "");
      const unit = spec.unit
        ? `<br><span class="sub">${esc(spec.unit)}</span>`
        : "";
      return `<th>${name}${unit}</th>`;
    })
    .join("");

  const row = (label: string, cells: string[]) =>
    `<tr><td class="row-label">${esc(label)}</td>${cells
      .map((c) => `<td>${c}</td>`)
      .join("")}</tr>`;

  const nominalRow = row(
    "基本値",
    rows.map(({ item }) =>
      item.inputType === "NUMBER" ? fmtNum(item.nominalValue) : "—",
    ),
  );
  const goalRow = row(
    "目標値",
    rows.map(({ spec }) => esc(goalLabel(spec) ?? "—")),
  );
  const topRow = row(
    "公差 Top",
    rows.map(({ item }) =>
      item.inputType === "NUMBER" ? fmtNum(item.toleranceTopDelta) : "—",
    ),
  );
  const bottomRow = row(
    "公差 Bottom",
    rows.map(({ item }) =>
      item.inputType === "NUMBER" ? fmtNum(item.toleranceBottomDelta) : "—",
    ),
  );
  const upperRow = row(
    "上限",
    rows.map(({ spec }) =>
      spec.toleranceMax != null ? fmtNum(spec.toleranceMax) : "—",
    ),
  );
  const lowerRow = row(
    "下限",
    rows.map(({ spec }) =>
      spec.toleranceMin != null ? fmtNum(spec.toleranceMin) : "—",
    ),
  );

  const sampleRows = columns
    .map((col) =>
      row(
        col.label,
        rows.map(({ item }) => col.cellByItemId[item.id] ?? ""),
      ),
    )
    .join("");

  const divider = `<tr class="grid-divider"><td colspan="${items.length + 1}"></td></tr>`;

  return `
    <table class="dim-grid">
      <thead><tr><th></th>${headCells}</tr></thead>
      <tbody>
        ${nominalRow}${goalRow}${topRow}${bottomRow}
        ${divider}
        ${upperRow}${lowerRow}
        ${divider}
        ${sampleRows}
      </tbody>
    </table>`;
}

// ── 形状（SHAPE区分の項目。旧帳票の「形状」10行フリーフォーム欄） ────────────

/**
 * section=SHAPE の項目だけを別枠に描画する。空欄シートは 10 行になるよう
 * 空行を補う（旧帳票の見た目に合わせる）。記入済みシートは実項目数のまま
 * （埋めた記録の後ろに無意味な空行を付けない）。
 */
export function shapeSectionHtml(
  items: ItemRow[],
  values?: Map<number, string>,
): string {
  const shapeItems = items.filter((it) => it.section === "SHAPE");
  if (shapeItems.length === 0) return "";
  const padToTen = values == null;
  const rowsHtml: string[] = shapeItems.map((it, i) => {
    const name = esc(localized(it.itemName as LocalizedText | null));
    const value = values?.get(it.id);
    return `<tr><td class="shape-no">${i + 1}</td><td>${name}</td><td class="shape-value">${value ? esc(value) : ""}</td></tr>`;
  });
  if (padToTen) {
    for (let i = shapeItems.length; i < 10; i++) {
      rowsHtml.push(
        `<tr><td class="shape-no">${i + 1}</td><td></td><td class="shape-value"></td></tr>`,
      );
    }
  }
  return `
    <div class="shape-title">形状</div>
    <table class="shape-table"><tbody>${rowsHtml.join("")}</tbody></table>`;
}

// ── 最終検査・出荷前確認（work_order_final_inspections。指示書紐づけ時のみ） ──

/** ルート側で uuid→表示名・日時を解決済みの文字列を渡す（DB/Date 依存を持ち込まない）。 */
export interface FinalInspectionPdfData {
  drawingLabelOk: boolean | null;
  drawingLabelChecked: string | null; // "氏名（日時）" 済み文字列
  protectiveCapOk: boolean | null;
  protectiveCapChecked: string | null;
  finishedQuantityOk: boolean | null;
  finishedQuantityChecked: string | null;
  spareStockUsed: boolean;
  spareStockReceived: boolean;
  shelved: string | null;
  deliveryNoteIssued: string | null;
  shipmentAuthorized: string | null;
  shipDefectReviewed: string | null;
  shipDefectNotes: string | null;
}

function checkCell(ok: boolean | null, checked: string | null): string {
  if (checked == null) return `<span class="shape-value"></span>`;
  const mark =
    ok === true
      ? '<span class="pass-mark pass">○</span>'
      : ok === false
        ? '<span class="pass-mark fail">×</span>'
        : "";
  return `${mark} ${esc(checked)}`;
}

function stageCell(value: string | null): string {
  return value ? esc(value) : BLANK;
}

/** work order 紐づけ時のみ呼ぶ（マスタ印刷 = work order 無しでは出さない）。 */
export function finalInspectionSectionHtml(
  fi: FinalInspectionPdfData | null,
): string {
  if (!fi) return "";
  return `
    <div class="final-title">最終検査</div>
    <table class="final-table">
      <tbody>
        <tr><td>図面・ラベル・膜厚・寸法と間違いがないか</td><td>${checkCell(fi.drawingLabelOk, fi.drawingLabelChecked)}</td></tr>
        <tr><td>保護キャップ使用しているか(φ0.6以下)</td><td>${checkCell(fi.protectiveCapOk, fi.protectiveCapChecked)}</td></tr>
        <tr><td>完成本数は合っているか</td><td>${checkCell(fi.finishedQuantityOk, fi.finishedQuantityChecked)}</td></tr>
      </tbody>
    </table>
    <div class="final-row">
      <span>予備在庫使用: ${fi.spareStockUsed ? "有" : "無"}</span>
      <span>予備在庫入庫: ${fi.spareStockReceived ? "有" : "無"}</span>
    </div>
    <table class="final-table">
      <tbody>
        <tr><td>棚包担当者</td><td>${stageCell(fi.shelved)}</td></tr>
        <tr><td>納品書発行者</td><td>${stageCell(fi.deliveryNoteIssued)}</td></tr>
        <tr><td>出荷許可者</td><td>${stageCell(fi.shipmentAuthorized)}</td></tr>
      </tbody>
    </table>
    <div class="final-row">
      <span>出荷時不良内容確認者印: ${stageCell(fi.shipDefectReviewed)}</span>
    </div>
    ${fi.shipDefectNotes ? `<div class="final-notes">${esc(fi.shipDefectNotes)}</div>` : ""}
  `;
}

/**
 * 参考画像の欄（テンプレートに設定されていれば印刷する。無ければ空文字）。
 * Gotenberg は同梱ファイルしか読めず、テンプレート画像はレコードごとに違う
 * 実体（SeaweedFS）なので、同梱アセットのように file 添付できない —
 * 呼び出し側（route.ts）が SeaweedFS から読んだバイト列を data URI にして渡す。
 */
export function templateImageHtml(
  dataUri: string | null,
  filename: string | null,
): string {
  if (!dataUri) return "";
  return `
    <div class="ref-image">
      <div class="ref-image-title">参考画像</div>
      <img alt="${esc(filename ?? "参考画像")}" src="${dataUri}" />
    </div>
  `;
}

/** テンプレートヘッダ部の共通データ（検査対象・記録方式を含む）。 */
export function sheetTemplateHead(t: TemplateHead, lotQuantity: number | null) {
  const sampling: InspectionSamplingSpec = {
    samplingMode: t.samplingMode,
    samplingValue: t.samplingValue == null ? null : Number(t.samplingValue),
  };
  const required = requiredSampleCount(sampling, lotQuantity);
  return {
    code: esc(t.code),
    version: `v${t.version}`,
    name: esc(localized(t.name as LocalizedText | null)),
    related_step: t.relatedProcessStep
      ? esc(localized(t.relatedProcessStep.name as LocalizedText | null))
      : "—",
    sampling: esc(samplingLabelJa(sampling, required)),
    record_style: t.recordStyle === "COUNTS" ? "合格数のみ" : "実測値",
  };
}

export const BLANK_LINE = BLANK;
