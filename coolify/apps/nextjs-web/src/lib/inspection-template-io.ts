/**
 * inspection-template-io.ts — 検査表テンプレート (MS09) の書き出し / 取込の**形**。
 *
 * 純粋なところだけを持つ（DB にも React にも触らない）。書き出し・取込の
 * サーバー側と、Excel 雛形の生成が、**同じ 1 つの定義**を見るようにするため。
 *
 * ## 形は 2 つ、役割が違う
 *
 *   JSON  … 往復が正確。環境をまたぐ持ち出し（dev → 本番）と退避に使う。
 *           入れ子（選択肢・目標値）をそのまま運べる。
 *   Excel … 現場・管理者が表計算で作って持ち込むための入口。1 行 = 1 検査項目で、
 *           検査表の情報は行に繰り返す（表計算で扱える形は平らな表だけ）。
 *
 * ## 環境をまたぐので **id では参照しない**
 *
 * 関連工程は `id` ではなく**工程コード**で持つ。id は環境ごとに違うので、
 * dev で書き出したものを本番へ入れると別の工程に化ける。コードなら
 * 見つからないときに「その工程が無い」と言える。
 *
 * ## 読めないものは読めないと言う
 *
 * 取込は**行ごとに理由を返す**。1 行おかしいだけで全部を捨てるのも、黙って
 * 既定値で埋めるのも避ける（前者は直す場所が分からず、後者は間違ったまま
 * 検査表が出来上がる）。
 */

import { z } from "zod";
import type { Locale } from "./i18n";
import { label } from "./messages";

/** ファイルの種別印。別のものを取り込ませないための札。 */
export const PORTABLE_KIND = "ckk.inspection-templates";
/** 形式の版。読む側は「知らない版」を拒否する。 */
export const PORTABLE_VERSION = 1;

// ── 表示ラベル ⇄ enum ───────────────────────────────────────────────────────
//
// Excel には**画面と同じ日本語**を書いてもらう。`SELECT_SINGLE` のような値は
// 画面のどこにも出ておらず、書ける人が居ない。

export const ITEM_TYPE_LABELS = {
  NUMBER: "数値",
  BOOLEAN: "はい/いいえ",
  SELECT_SINGLE: "単一選択",
  SELECT_MULTI: "複数選択",
} as const;

export const SAMPLING_LABELS = {
  ALL: "全数",
  PERCENT: "割合(%)",
  COUNT: "本数",
} as const;

export const RECORD_STYLE_LABELS = {
  VALUES: "実測値",
  COUNTS: "合格数のみ",
} as const;

export const LAYOUT_STYLE_LABELS = {
  DIMENSIONAL: "寸法表",
  CHECKLIST: "チェックリスト",
} as const;

export const SAMPLE_NAMING_LABELS = {
  GENERIC: "製品1・2・3…",
  INITIAL_MID_FINAL: "初品・中間品・最終品",
} as const;

export const SECTION_LABELS = {
  MEASUREMENT: "測定",
  SHAPE: "形状",
} as const;

export const DEPARTMENT_LABELS = {
  MANUFACTURING: "製造",
  QUALITY_ASSURANCE: "品証",
} as const;

/** ラベル（日本語）→ enum。enum そのものを書かれても受ける。 */
function fromLabel<T extends string>(
  labels: Record<T, string>,
  raw: string,
): T | null {
  const value = raw.trim();
  if (!value) return null;
  const keys = Object.keys(labels) as T[];
  if (keys.includes(value as T)) return value as T;
  const hit = keys.find((k) => labels[k] === value);
  return hit ?? null;
}

// ── JSON の形 ───────────────────────────────────────────────────────────────

const localizedSchema = z
  .object({ ja: z.string().min(1) })
  .catchall(z.string());

export const portableItemSchema = z.object({
  itemName: localizedSchema,
  inputType: z.enum(["NUMBER", "BOOLEAN", "SELECT_SINGLE", "SELECT_MULTI"]),
  unit: z.string().nullable().default(null),
  toleranceMin: z.number().nullable().default(null),
  toleranceMax: z.number().nullable().default(null),
  /** SELECT_*: [{ value, label }] */
  options: z
    .array(z.object({ value: z.string(), label: localizedSchema }))
    .nullable()
    .default(null),
  acceptBool: z.boolean().nullable().default(null),
  acceptOptions: z.array(z.string()).nullable().default(null),
  goalValue: z.unknown().nullable().default(null),
  allowManualOverride: z.boolean().default(true),
  isRequired: z.boolean().default(true),
  // ── 旧帳票（製品検査記録）に合わせた項目（#703）──────────────────────
  // **既定つきなので、これらを持たない古いファイルもそのまま取り込める。**
  section: z.enum(["MEASUREMENT", "SHAPE"]).default("MEASUREMENT"),
  department: z
    .enum(["MANUFACTURING", "QUALITY_ASSURANCE"])
    .nullable()
    .default(null),
  measurementEquipment: z.string().nullable().default(null),
  nominalValue: z.number().nullable().default(null),
  toleranceTopDelta: z.number().nullable().default(null),
  toleranceBottomDelta: z.number().nullable().default(null),
});

export const portableTemplateSchema = z.object({
  code: z.string().min(1),
  name: localizedSchema,
  /** 工程は**コード**で参照する（id は環境ごとに違う）。 */
  relatedProcessStepCode: z.string().nullable().default(null),
  samplingMode: z.enum(["ALL", "PERCENT", "COUNT"]).default("ALL"),
  samplingValue: z.number().nullable().default(null),
  recordStyle: z.enum(["VALUES", "COUNTS"]).default("VALUES"),
  layoutStyle: z.enum(["DIMENSIONAL", "CHECKLIST"]).default("DIMENSIONAL"),
  sampleNaming: z.enum(["GENERIC", "INITIAL_MID_FINAL"]).default("GENERIC"),
  isActive: z.boolean().default(true),
  items: z.array(portableItemSchema),
});

export const portableFileSchema = z.object({
  kind: z.literal(PORTABLE_KIND),
  version: z.literal(PORTABLE_VERSION),
  exportedAt: z.string().optional(),
  templates: z.array(portableTemplateSchema).min(1),
});

export type PortableItem = z.infer<typeof portableItemSchema>;
export type PortableTemplate = z.infer<typeof portableTemplateSchema>;
export type PortableFile = z.infer<typeof portableFileSchema>;

// ── Excel の列 ──────────────────────────────────────────────────────────────
//
// 雛形の生成と取込の解釈が**同じ並び**を見るように、ここに 1 本化する。

export const EXCEL_COLUMNS = [
  { key: "code", header: "検査表コード", width: 18 },
  { key: "name", header: "検査表名", width: 28 },
  { key: "processStepCode", header: "関連工程コード", width: 18 },
  { key: "samplingMode", header: "検査対象", width: 12 },
  { key: "samplingValue", header: "検査対象の値", width: 12 },
  { key: "recordStyle", header: "記録方式", width: 12 },
  { key: "layoutStyle", header: "レイアウト", width: 14 },
  { key: "sampleNaming", header: "サンプル呼称", width: 18 },
  { key: "itemName", header: "項目名", width: 24 },
  { key: "inputType", header: "型", width: 12 },
  { key: "unit", header: "単位", width: 8 },
  { key: "toleranceMin", header: "下限", width: 10 },
  { key: "toleranceMax", header: "上限", width: 10 },
  { key: "options", header: "選択肢", width: 24 },
  { key: "acceptOptions", header: "合格とする選択肢", width: 20 },
  { key: "acceptBool", header: "合格とする回答", width: 14 },
  { key: "goalValue", header: "目標値", width: 12 },
  { key: "isRequired", header: "必須", width: 8 },
  { key: "allowManualOverride", header: "手動上書き", width: 12 },
  { key: "section", header: "掲載区分", width: 10 },
  { key: "department", header: "担当部門", width: 10 },
  { key: "measurementEquipment", header: "測定機器", width: 12 },
  { key: "nominalValue", header: "基本値", width: 10 },
  { key: "toleranceTopDelta", header: "公差Top", width: 10 },
  { key: "toleranceBottomDelta", header: "公差Bottom", width: 12 },
] as const;

export type ExcelColumnKey = (typeof EXCEL_COLUMNS)[number]["key"];

/** 取込の 1 行ぶんの読み取り失敗。**行番号を必ず持つ**（直す場所が要る）。 */
export interface ImportRowError {
  /** 1 始まり。Excel の行番号と一致させる（見出しが 1 行目）。 */
  row: number;
  message: string;
}

const TRUE_WORDS = ["はい", "yes", "true", "1", "○", "有効", "必須"];
const FALSE_WORDS = ["いいえ", "no", "false", "0", "×", "無効", "任意"];

/** 空欄は既定値。書いてあれば真偽に直す。読めなければ null。 */
function parseBool(raw: string, fallback: boolean): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  if (TRUE_WORDS.includes(v)) return true;
  if (FALSE_WORDS.includes(v)) return false;
  return null;
}

function parseNumber(raw: string): number | null | undefined {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined; // undefined = 読めない
}

/** 「A|B|C」または「A,B,C」で区切った選択肢。 */
function splitList(raw: string): string[] {
  return raw
    .split(/[|,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Excel の格子（先頭行 = 見出し）を持ち出し形式へ。
 *
 * 見出しは**位置ではなく名前で照合**する（列を足したり並べ替えたりされても
 * 壊れないように）。1 行 = 1 検査項目で、検査表コードでまとめる。
 */
export function rowsToPortable(
  rows: string[][],
  locale: Locale = "ja",
): {
  templates: PortableTemplate[];
  errors: ImportRowError[];
} {
  const errors: ImportRowError[] = [];
  if (rows.length === 0) {
    return {
      templates: [],
      errors: [
        { row: 1, message: label("inspectionTemplateIo.emptyFile", locale) },
      ],
    };
  }

  // 見出し → 列番号
  const header = rows[0].map((h) => h.trim());
  const at: Partial<Record<ExcelColumnKey, number>> = {};
  for (const col of EXCEL_COLUMNS) {
    const idx = header.indexOf(col.header);
    if (idx >= 0) at[col.key] = idx;
  }
  const missing = (["code", "name", "itemName"] as const).filter(
    (k) => at[k] === undefined,
  );
  if (missing.length > 0) {
    const names = missing.map(
      (k) => EXCEL_COLUMNS.find((c) => c.key === k)?.header ?? k,
    );
    return {
      templates: [],
      errors: [
        {
          row: 1,
          message: label("inspectionTemplateIo.missingHeaders", locale, "", {
            names: names.join(" / "),
          }),
        },
      ],
    };
  }

  const cell = (row: string[], key: ExcelColumnKey): string => {
    const i = at[key];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };

  const byCode = new Map<string, PortableTemplate>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowNo = r + 1; // Excel の行番号
    if (!row || row.every((c) => !c?.trim())) continue; // 空行は飛ばす

    const code = cell(row, "code");
    const itemName = cell(row, "itemName");
    if (!code) {
      errors.push({
        row: rowNo,
        message: label("inspectionTemplateIo.emptyTemplateCode", locale),
      });
      continue;
    }
    if (!itemName) {
      errors.push({
        row: rowNo,
        message: label("inspectionTemplateIo.emptyItemName", locale),
      });
      continue;
    }

    let template = byCode.get(code);
    if (!template) {
      const name = cell(row, "name");
      if (!name) {
        errors.push({
          row: rowNo,
          message: label("inspectionTemplateIo.emptyTemplateName", locale, "", {
            code,
          }),
        });
        continue;
      }
      const samplingMode =
        fromLabel(SAMPLING_LABELS, cell(row, "samplingMode")) ?? "ALL";
      const recordStyle =
        fromLabel(RECORD_STYLE_LABELS, cell(row, "recordStyle")) ?? "VALUES";
      const samplingValue = parseNumber(cell(row, "samplingValue"));
      if (samplingValue === undefined) {
        errors.push({
          row: rowNo,
          message: label("inspectionTemplateIo.samplingValueNotNumber", locale),
        });
        continue;
      }
      template = {
        code,
        name: { ja: name },
        relatedProcessStepCode: cell(row, "processStepCode") || null,
        samplingMode,
        samplingValue,
        recordStyle,
        layoutStyle:
          fromLabel(LAYOUT_STYLE_LABELS, cell(row, "layoutStyle")) ??
          "DIMENSIONAL",
        sampleNaming:
          fromLabel(SAMPLE_NAMING_LABELS, cell(row, "sampleNaming")) ??
          "GENERIC",
        isActive: true,
        items: [],
      };
      byCode.set(code, template);
    }

    const inputType =
      fromLabel(ITEM_TYPE_LABELS, cell(row, "inputType")) ?? "NUMBER";
    const min = parseNumber(cell(row, "toleranceMin"));
    const max = parseNumber(cell(row, "toleranceMax"));
    if (min === undefined || max === undefined) {
      errors.push({
        row: rowNo,
        message: label("inspectionTemplateIo.toleranceNotNumber", locale),
      });
      continue;
    }
    const isRequired = parseBool(cell(row, "isRequired"), true);
    const allowManualOverride = parseBool(
      cell(row, "allowManualOverride"),
      true,
    );
    if (isRequired === null || allowManualOverride === null) {
      errors.push({
        row: rowNo,
        message: label(
          "inspectionTemplateIo.requiredOverrideMustBeYesNo",
          locale,
        ),
      });
      continue;
    }
    const acceptBoolRaw = cell(row, "acceptBool");
    const acceptBool =
      inputType === "BOOLEAN" && acceptBoolRaw
        ? parseBool(acceptBoolRaw, true)
        : null;
    if (acceptBool === null && inputType === "BOOLEAN" && acceptBoolRaw) {
      errors.push({
        row: rowNo,
        message: label("inspectionTemplateIo.acceptBoolMustBeYesNo", locale),
      });
      continue;
    }

    // 旧帳票の数値欄（基本値・公差 Top/Bottom）も同じ扱いで読む
    const nominal = parseNumber(cell(row, "nominalValue"));
    const topDelta = parseNumber(cell(row, "toleranceTopDelta"));
    const bottomDelta = parseNumber(cell(row, "toleranceBottomDelta"));
    if (
      nominal === undefined ||
      topDelta === undefined ||
      bottomDelta === undefined
    ) {
      errors.push({
        row: rowNo,
        message: label(
          "inspectionTemplateIo.nominalToleranceNotNumber",
          locale,
        ),
      });
      continue;
    }

    const optionValues = splitList(cell(row, "options"));
    const goalRaw = cell(row, "goalValue");

    if (!template) continue; // 上で必ず作っているが、型のうえで閉じる
    template.items.push({
      itemName: { ja: itemName },
      inputType,
      unit: cell(row, "unit") || null,
      toleranceMin: inputType === "NUMBER" ? min : null,
      toleranceMax: inputType === "NUMBER" ? max : null,
      options:
        optionValues.length > 0
          ? optionValues.map((v) => ({ value: v, label: { ja: v } }))
          : null,
      acceptOptions: splitList(cell(row, "acceptOptions")),
      acceptBool,
      goalValue: goalRaw || null,
      allowManualOverride,
      isRequired,
      section: fromLabel(SECTION_LABELS, cell(row, "section")) ?? "MEASUREMENT",
      department: fromLabel(DEPARTMENT_LABELS, cell(row, "department")),
      measurementEquipment: cell(row, "measurementEquipment") || null,
      nominalValue: nominal,
      toleranceTopDelta: topDelta,
      toleranceBottomDelta: bottomDelta,
    });
  }

  // 項目が 1 つも無い検査表は作らない（空の検査表は現場で使えない）
  const templates: PortableTemplate[] = [];
  for (const t of byCode.values()) {
    if (t.items.length === 0) {
      errors.push({
        row: 1,
        message: label("inspectionTemplateIo.noItems", locale, "", {
          code: t.code,
        }),
      });
      continue;
    }
    templates.push(t);
  }

  return { templates, errors };
}
