/**
 * inspection-core.ts — 検査表の純ロジック（isomorphic・依存なし）。
 *
 * 検査項目の型（真偽/数値/単一・複数選択）ごとの実測値エンコード・自動合否判定・
 * 抜取検査の要求サンプル数・表示ラベル。Prisma I/O は持たない。
 *
 * **twin file**: nextjs-web/src/lib と nextjs-kiosk/src/lib の逐語コピー
 * （キオスクも検査記録を書くため判定規則を二重実装しない）。変更時は
 * nextjs-kiosk `pnpm twin:sync` で再コピーし両側をレビューする —
 * `twin-files.test.ts` がドリフトで落ちる。
 *
 * 実測値の表現（DB inspection_record_items.measured_values の要素と同形）:
 * - BOOLEAN       → "true" | "false"
 * - NUMBER        → 数値文字列（例 "8.02"）
 * - SELECT_SINGLE → 選択肢の value
 * - SELECT_MULTI  → 選択肢 value の配列
 *
 * ★ 表示ラベル（`formatSampleValue` / `acceptLabel` / `goalLabel` /
 *   `formatCounts`）は呼び出し側から渡す `BoolLabels`（はい/いいえ・合格範囲の
 *   言い回し・列挙の区切り）で文言を解決する。**引数を省略したときの既定値は
 *   ja**（PDF 生成・テストのオラクル用） — 実際の画面（web/kiosk）は自分の
 *   i18n から作った `BoolLabels` を渡す。`samplingLabelJa` / `sampleLabel` は
 *   引数を持たない ja 固定のまま（PDF 専用。画面用の言語対応版は web の
 *   lib/inspection-labels.ts、kiosk は StepInspectionForm.tsx が自前で持つ）。
 */

export type InspectionItemType =
  | "BOOLEAN"
  | "NUMBER"
  | "SELECT_SINGLE"
  | "SELECT_MULTI"
  | "TEXT"; // フリーフォーム文字列（形状確認欄など）。合否は常に手動

export type InspectionSamplingMode = "ALL" | "PERCENT" | "COUNT";

/** 記録方式: VALUES = 製品ごとの実測値 / COUNTS = 合格数のみ（検査数・合格数）。 */
export type InspectionRecordStyle = "VALUES" | "COUNTS";

/** VALUES のサンプル呼称。INITIAL_MID_FINAL は先頭3件を初品/中間品/最終品と呼ぶ。 */
export type InspectionSampleNaming = "GENERIC" | "INITIAL_MID_FINAL";

/** 選択肢（inspection_template_items.options の要素）。 */
export interface InspectionSelectOption {
  value: string;
  label: Record<string, string>; // { ja, en } — 欠けは ja へフォールバック
}

/** 1 サンプルの実測値。SELECT_MULTI のみ配列。 */
export type InspectionSampleValue = string | string[];

/** 判定・表示に必要な項目定義（テンプレート項目行の view）。 */
export interface InspectionItemSpec {
  id: number;
  inputType: InspectionItemType;
  unit: string | null;
  toleranceMin: number | null; // NUMBER: 合格範囲 下限
  toleranceMax: number | null; // NUMBER: 合格範囲 上限
  options: InspectionSelectOption[]; // SELECT_* 以外は []
  acceptBool: boolean | null; // BOOLEAN: 合格とする回答
  acceptOptions: string[] | null; // SELECT_*: 合格とする value[]
  goalValue: unknown; // number | boolean | string | string[] | null
  /** 合否の手動上書きを許可（false = 自動判定のみ。基準未設定の項目は常に手動）。 */
  allowManualOverride: boolean;
  isRequired: boolean;
}

/** 検査対象（シート単位の抜取設定 — inspection_templates.sampling_*）。 */
export interface InspectionSamplingSpec {
  samplingMode: InspectionSamplingMode;
  samplingValue: number | null; // PERCENT: % / COUNT: 本数
}

// ── JSON カラムのパース（DB 由来の unknown を安全に絞る） ────────────────────

/** options JSON → 選択肢配列（不正要素は捨てる）。 */
export function parseSelectOptions(raw: unknown): InspectionSelectOption[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionSelectOption[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { value, label } = entry as { value?: unknown; label?: unknown };
    if (typeof value !== "string" || value === "") continue;
    const labels: Record<string, string> = {};
    if (typeof label === "object" && label !== null) {
      for (const [k, v] of Object.entries(label as Record<string, unknown>)) {
        if (typeof v === "string") labels[k] = v;
      }
    }
    out.push({ value, label: labels });
  }
  return out;
}

/** accept_options / measured_values 要素などの string[] JSON。 */
export function parseStringArray(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is string => typeof v === "string");
}

/** measured_values JSON → サンプル配列（string | string[] 以外は捨てる）。 */
export function parseStoredSamples(raw: unknown): InspectionSampleValue[] {
  if (!Array.isArray(raw)) return [];
  const out: InspectionSampleValue[] = [];
  for (const v of raw) {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) {
      out.push(v.filter((x): x is string => typeof x === "string"));
    }
  }
  return out;
}

/** inspection_template_items 行のうち spec 変換に使うフィールド（Prisma 由来）。 */
export interface InspectionItemRecord {
  id: number;
  inputType: InspectionItemType;
  unit: string | null;
  toleranceMin: unknown; // Prisma Decimal
  toleranceMax: unknown;
  options: unknown;
  acceptBool: boolean | null;
  acceptOptions: unknown;
  goalValue: unknown;
  allowManualOverride: boolean;
  isRequired: boolean;
}

/** inspection_templates 行の抜取・記録方式列 → シート設定（Decimal → Number）。 */
export function samplingSpecFromRow(row: {
  samplingMode: InspectionSamplingMode;
  samplingValue: unknown; // Prisma Decimal
  recordStyle: InspectionRecordStyle;
}): InspectionSamplingSpec & { recordStyle: InspectionRecordStyle } {
  return {
    samplingMode: row.samplingMode,
    samplingValue: row.samplingValue == null ? null : Number(row.samplingValue),
    recordStyle: row.recordStyle,
  };
}

const asNumber = (v: unknown): number | null => (v == null ? null : Number(v));

/** DB 行（Decimal / Json そのまま）→ 判定・表示 spec。 */
export function itemSpecFromRow(row: InspectionItemRecord): InspectionItemSpec {
  return {
    id: row.id,
    inputType: row.inputType,
    unit: row.unit,
    toleranceMin: asNumber(row.toleranceMin),
    toleranceMax: asNumber(row.toleranceMax),
    options: parseSelectOptions(row.options),
    acceptBool: row.acceptBool,
    acceptOptions: parseStringArray(row.acceptOptions),
    goalValue: row.goalValue ?? null,
    allowManualOverride: row.allowManualOverride,
    isRequired: row.isRequired,
  };
}

/** 合格基準が設定されているか（= 自動判定の対象になり得るか）。 */
export function hasAcceptCriteria(item: InspectionItemSpec): boolean {
  switch (item.inputType) {
    case "BOOLEAN":
      return item.acceptBool != null;
    case "NUMBER":
      return item.toleranceMin != null || item.toleranceMax != null;
    case "SELECT_SINGLE":
    case "SELECT_MULTI":
      return item.acceptOptions != null && item.acceptOptions.length > 0;
    case "TEXT":
      return false; // フリーフォームは基準を持たない — 常に手動判定
  }
}

/** 記録エントリ（フォーム/保存の共通形）— VALUES はサンプル配列、COUNTS は検査数・合格数。 */
export interface InspectionItemEntryData {
  samples: readonly InspectionSampleValue[];
  inspectedCount: number | null;
  passedCount: number | null;
}

/**
 * 合格数のみ記録（COUNTS）の自動判定 — 全数合格（不合格 0）で合格。
 * 検査数未入力（または 0）は判定不能。
 */
export function evaluateCounts(
  inspected: number | null,
  passed: number | null,
): boolean | null {
  if (inspected == null || passed == null || inspected <= 0) return null;
  return passed >= inspected;
}

/** 記録方式（シート単位）に応じた項目の自動判定。 */
export function evaluateEntry(
  item: InspectionItemSpec,
  entry: InspectionItemEntryData,
  style: InspectionRecordStyle,
): boolean | null {
  return style === "COUNTS"
    ? evaluateCounts(entry.inspectedCount, entry.passedCount)
    : evaluateItem(item, entry.samples);
}

/** エントリに何か入力されているか（3 状態表示の「入力待ち」判定に使う）。 */
export function isEntryStarted(
  entry: InspectionItemEntryData,
  style: InspectionRecordStyle,
): boolean {
  return style === "COUNTS"
    ? entry.inspectedCount != null || entry.passedCount != null
    : entry.samples.some((s) => !isSampleEmpty(s));
}

/**
 * 項目の実効合否 — 上書き不可（かつ自動判定が出る）なら自動判定を強制。
 * それ以外は 手動上書き > 自動判定 > 既定 合格。web/kiosk のフォームと
 * サーバー保存の両方がこの規則を使う。
 */
export function resolveItemPass(
  item: InspectionItemSpec,
  entry: InspectionItemEntryData,
  manualPass: boolean | null,
  style: InspectionRecordStyle,
): boolean {
  const auto = evaluateEntry(item, entry, style);
  if (!item.allowManualOverride && auto != null) return auto;
  return manualPass ?? auto ?? true;
}

/** 合格数のみ記録の表示（例: 合格 4/5）。 */
export function formatCounts(
  inspected: number | null,
  passed: number | null,
  passLabel = "合格", // i18n-ignore — 既定値は ja（PDF・テスト用）。画面は呼び出し側で渡す
): string {
  return `${passLabel} ${passed ?? "—"}/${inspected ?? "—"}`;
}

// ── 判定 ─────────────────────────────────────────────────────────────────────

/** サンプルが未入力か（空白のみ・空配列は未入力扱い）。 */
export function isSampleEmpty(value: InspectionSampleValue): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim() === "";
}

/**
 * 1 サンプルの自動合否。null = 判定不能（基準未設定・未入力・数値パース不能）
 * → 手動判定に委ねる。
 */
export function evaluateSample(
  item: InspectionItemSpec,
  value: InspectionSampleValue,
): boolean | null {
  if (isSampleEmpty(value)) return null;
  switch (item.inputType) {
    case "BOOLEAN": {
      if (item.acceptBool == null || Array.isArray(value)) return null;
      if (value !== "true" && value !== "false") return null;
      return (value === "true") === item.acceptBool;
    }
    case "NUMBER": {
      if (item.toleranceMin == null && item.toleranceMax == null) return null;
      if (Array.isArray(value)) return null;
      const n = Number(value.trim());
      if (!Number.isFinite(n)) return null;
      if (item.toleranceMin != null && n < item.toleranceMin) return false;
      if (item.toleranceMax != null && n > item.toleranceMax) return false;
      return true;
    }
    case "SELECT_SINGLE": {
      if (item.acceptOptions == null || Array.isArray(value)) return null;
      return item.acceptOptions.includes(value);
    }
    case "SELECT_MULTI": {
      if (item.acceptOptions == null) return null;
      const values = Array.isArray(value) ? value : [value];
      const accept = item.acceptOptions;
      return values.every((v) => accept.includes(v));
    }
    case "TEXT":
      return null; // 基準を持たない — 常に手動判定
  }
}

/**
 * 項目の自動合否 — 入力済みサンプル全体で判定。
 * 1 つでも不合格 → false / 全サンプル合格 → true / それ以外（未入力のみ・
 * 判定不能サンプルを含む）→ null（手動判定）。
 */
export function evaluateItem(
  item: InspectionItemSpec,
  samples: readonly InspectionSampleValue[],
): boolean | null {
  const entered = samples.filter((s) => !isSampleEmpty(s));
  if (entered.length === 0) return null;
  let allPass = true;
  for (const s of entered) {
    const verdict = evaluateSample(item, s);
    if (verdict === false) return false;
    if (verdict !== true) allPass = false;
  }
  return allPass ? true : null;
}

// ── 抜取検査 ─────────────────────────────────────────────────────────────────

/**
 * 検査する製品数（シート単位）。null = 不定（PERCENT/ALL でロット数量が不明）。
 * PERCENT は切り上げ・最低 1・ロット数上限。COUNT はロット数上限。
 */
export function requiredSampleCount(
  sampling: InspectionSamplingSpec,
  lotQuantity: number | null,
): number | null {
  const lot =
    lotQuantity != null && lotQuantity > 0 ? Math.floor(lotQuantity) : null;
  switch (sampling.samplingMode) {
    case "ALL":
      return lot;
    case "PERCENT": {
      if (sampling.samplingValue == null || lot == null) return null;
      const n = Math.ceil((lot * sampling.samplingValue) / 100);
      return Math.min(Math.max(n, 1), lot);
    }
    case "COUNT": {
      if (sampling.samplingValue == null) return null;
      const n = Math.max(Math.round(sampling.samplingValue), 1);
      return lot == null ? n : Math.min(n, lot);
    }
  }
}

// ── 必須チェック ─────────────────────────────────────────────────────────────

/**
 * 必須項目のうちサンプルが 1 つも入力されていないものの id 列。
 * （旧 steps-core.missingRequiredItems の複数サンプル版）
 */
export function missingRequiredEntries(
  items: readonly Pick<InspectionItemSpec, "id" | "isRequired">[],
  samplesByItem: Readonly<
    Record<number, readonly InspectionSampleValue[] | undefined>
  >,
): number[] {
  return items
    .filter(
      (it) =>
        it.isRequired &&
        !(samplesByItem[it.id] ?? []).some((s) => !isSampleEmpty(s)),
    )
    .map((it) => it.id);
}

// ── 表示ラベル ───────────────────────────────────────────────────────────────

/**
 * はい/いいえ・NUMBER の合格範囲の言い回し・列挙の区切りの表示ラベル
 * （web/kiosk はそれぞれの i18n から組み立てて渡す）。
 *
 * `rangeBetween` / `rangeAtLeast` / `rangeAtMost` は**関数**で渡す
 * （文字列テンプレートにすると、呼び出し側が next-intl の ICU で解決した
 * 文言をそのまま埋め込めない — `{min}`/`{max}` は本物の値が要る場所にしか
 * 書けない。関数なら呼び出し側で `tr(key, { min, max })` を実行してから
 * 返せる）。
 */
export interface BoolLabels {
  yes: string;
  no: string;
  /** 既定 "{min} 〜 {max}"。 */
  rangeBetween?: (min: string, max: string) => string;
  /** 既定 "{min} 以上"。 */
  rangeAtLeast?: (min: string) => string;
  /** 既定 "{max} 以下"。 */
  rangeAtMost?: (max: string) => string;
  /** SELECT_MULTI の選択肢を並べるときの区切り。既定 "・"。 */
  listSeparator?: string;
}

// 既定値は ja（PDF・テスト用）。画面は呼び出し側で BoolLabels を渡す
export const BOOL_LABELS_JA: BoolLabels = {
  yes: "はい", // i18n-ignore
  no: "いいえ", // i18n-ignore
  rangeBetween: (min, max) => `${min} 〜 ${max}`, // i18n-ignore
  rangeAtLeast: (min) => `${min} 以上`, // i18n-ignore
  rangeAtMost: (max) => `${max} 以下`, // i18n-ignore
  listSeparator: "・", // i18n-ignore
};

function optionLabel(
  item: InspectionItemSpec,
  value: string,
  locale: string,
): string {
  const opt = item.options.find((o) => o.value === value);
  if (!opt) return value;
  return opt.label[locale] || opt.label.ja || value;
}

/** 実測値 1 サンプルの表示文字列。 */
export function formatSampleValue(
  item: InspectionItemSpec,
  value: InspectionSampleValue,
  locale = "ja",
  bool: BoolLabels = BOOL_LABELS_JA,
): string {
  if (isSampleEmpty(value)) return "—";
  switch (item.inputType) {
    case "BOOLEAN":
      return value === "true" ? bool.yes : bool.no;
    case "NUMBER":
      return item.unit ? `${value} ${item.unit}` : String(value);
    case "SELECT_SINGLE":
      return optionLabel(item, value as string, locale);
    case "SELECT_MULTI": {
      const values = Array.isArray(value) ? value : [value];
      return values
        .map((v) => optionLabel(item, v, locale))
        .join(bool.listSeparator ?? BOOL_LABELS_JA.listSeparator ?? "");
    }
    case "TEXT":
      return Array.isArray(value)
        ? value.join(bool.listSeparator ?? BOOL_LABELS_JA.listSeparator ?? "")
        : value;
  }
}

/** 合格基準の表示（基準未設定は null）。 */
export function acceptLabel(
  item: InspectionItemSpec,
  locale = "ja",
  bool: BoolLabels = BOOL_LABELS_JA,
): string | null {
  switch (item.inputType) {
    case "BOOLEAN":
      if (item.acceptBool == null) return null;
      return item.acceptBool ? bool.yes : bool.no;
    case "NUMBER": {
      const unit = item.unit ? ` ${item.unit}` : "";
      const min = item.toleranceMin != null ? String(item.toleranceMin) : "";
      const max = item.toleranceMax != null ? String(item.toleranceMax) : "";
      const rangeBetween = bool.rangeBetween ?? BOOL_LABELS_JA.rangeBetween;
      const rangeAtLeast = bool.rangeAtLeast ?? BOOL_LABELS_JA.rangeAtLeast;
      const rangeAtMost = bool.rangeAtMost ?? BOOL_LABELS_JA.rangeAtMost;
      if (item.toleranceMin != null && item.toleranceMax != null) {
        return `${rangeBetween?.(min, max) ?? ""}${unit}`;
      }
      if (item.toleranceMin != null) {
        return `${rangeAtLeast?.(min) ?? ""}${unit}`;
      }
      if (item.toleranceMax != null) {
        return `${rangeAtMost?.(max) ?? ""}${unit}`;
      }
      return null;
    }
    case "SELECT_SINGLE":
    case "SELECT_MULTI": {
      if (item.acceptOptions == null || item.acceptOptions.length === 0) {
        return null;
      }
      return item.acceptOptions
        .map((v) => optionLabel(item, v, locale))
        .join(bool.listSeparator ?? BOOL_LABELS_JA.listSeparator ?? "");
    }
    case "TEXT":
      return null; // 基準を持たない
  }
}

/** 目標値の表示（未設定は null）。 */
export function goalLabel(
  item: InspectionItemSpec,
  locale = "ja",
  bool: BoolLabels = BOOL_LABELS_JA,
): string | null {
  const goal = item.goalValue;
  if (goal == null) return null;
  switch (item.inputType) {
    case "BOOLEAN":
      if (typeof goal !== "boolean") return null;
      return goal ? bool.yes : bool.no;
    case "NUMBER": {
      if (typeof goal !== "number") return null;
      return item.unit ? `${goal} ${item.unit}` : String(goal);
    }
    case "SELECT_SINGLE":
      if (typeof goal !== "string") return null;
      return optionLabel(item, goal, locale);
    case "SELECT_MULTI": {
      const values = parseStringArray(goal);
      if (values == null || values.length === 0) return null;
      return values
        .map((v) => optionLabel(item, v, locale))
        .join(bool.listSeparator ?? BOOL_LABELS_JA.listSeparator ?? "");
    }
    case "TEXT":
      return typeof goal === "string" ? goal : null;
  }
}

/**
 * 検査対象の表示。**ja 固定 — 検査記録 PDF 専用**（内部文書は ja 固定という
 * 既定の約束。見積書等の取引先向け書類とは扱いが違う）。required を渡すと
 * 「（n本）」を併記。画面表示は web の lib/inspection-labels.ts の
 * `samplingLabel(tr, …)`、kiosk は StepInspectionForm.tsx の自前関数を使う。
 */
export function samplingLabelJa(
  sampling: InspectionSamplingSpec,
  required?: number | null,
): string {
  switch (sampling.samplingMode) {
    case "ALL":
      if (required != null) return `全数（${required}本）`; // i18n-ignore
      return "全数"; // i18n-ignore
    case "PERCENT": {
      const pct = sampling.samplingValue ?? 0;
      if (required != null) return `抜取 ${pct}%（${required}本）`; // i18n-ignore
      return `抜取 ${pct}%`; // i18n-ignore
    }
    case "COUNT":
      return `抜取 ${required ?? sampling.samplingValue ?? 0}本`; // i18n-ignore
  }
}

/** VALUES 記録方式のサンプル呼称（先頭3件だけ初品/中間品/最終品になり得る）。 */
// i18n-ignore — PDF 専用 ja 固定（画面は inspection-labels.ts の sampleLabel(tr, …)）
const INITIAL_MID_FINAL_LABELS = ["初品", "中間品", "最終品"] as const;

/**
 * サンプルページの見出し（index は 0 始まり）。**ja 固定 — 検査記録 PDF 専用**
 * （samplingLabelJa と同じ理由）。
 */
export function sampleLabel(
  index: number,
  naming: InspectionSampleNaming,
): string {
  if (
    naming === "INITIAL_MID_FINAL" &&
    index < INITIAL_MID_FINAL_LABELS.length
  ) {
    return INITIAL_MID_FINAL_LABELS[index];
  }
  // i18n-ignore — PDF 専用 ja 固定（画面は inspection-labels.ts）
  return `製品 ${index + 1}`;
}
