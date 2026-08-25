/**
 * form-schema.ts — フォーム (CM02) の項目定義・検証・受付判定。
 *
 * client-safe（`server-only` 無し）: ビルダー / 回答フォーム / Server Action の
 * すべてがここを使う。**検証は必ずこの 1 本を通す** — クライアント側の入力チェックと
 * サーバ側の受理判定が別実装だと、片方だけ直したときに静かに食い違う。
 *
 * 設計は lib/product-types.ts（SY03 製品項目）を手本にしつつ、選択肢ラベルは
 * inspection-core.ts に合わせて {ja,en} にしてある（product-types は string で、
 * リポジトリ内で唯一 i18n から外れている）。
 *
 * 値の表現（DB form_responses.answers の中身）:
 *   text/textarea/date/time  → string
 *   number                   → string（表現をそのまま保持。丸め・桁落ちを避ける）
 *   select                   → string（選択肢の value）
 *   multiselect              → string[]
 *   lookup                   → { id, label } … ラベルもスナップショットする。
 *                              参照先が改名・削除されても回答が読めるようにするため。
 *   attachment               → string[]（files.id）
 *   richtext                 → ProseMirror doc JSON（lib/rich-text-core.ts で検証）
 *   table                    → Array<Record<colKey, 上記のいずれか>>
 *   related                  → 値を持たない（読み取り専用の埋め込み表示）
 */

import { z } from "zod";

// ─── 項目型 ──────────────────────────────────────────────────────────────────

export type FormFieldType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "date"
  | "time"
  | "select"
  | "multiselect"
  | "lookup"
  | "attachment"
  | "table"
  | "related";

export const FORM_FIELD_TYPES: { value: FormFieldType; label: string }[] = [
  { value: "text", label: "1行テキスト" },
  { value: "textarea", label: "複数行テキスト" },
  { value: "richtext", label: "リッチテキスト" },
  { value: "number", label: "数値" },
  { value: "date", label: "日付" },
  { value: "time", label: "時刻" },
  { value: "select", label: "ドロップダウン（1つ選択）" },
  { value: "multiselect", label: "複数選択" },
  { value: "lookup", label: "業務データ検索" },
  { value: "attachment", label: "添付ファイル" },
  { value: "table", label: "サブテーブル（行を追加できる表）" },
  { value: "related", label: "関連レコード一覧" },
];

/** サブテーブルの列に置けない型（入れ子は 1 段までにする）。 */
const NOT_NESTABLE: ReadonlySet<FormFieldType> = new Set([
  "table",
  "related",
  "richtext",
]);

export function isNestableFieldType(type: FormFieldType): boolean {
  return !NOT_NESTABLE.has(type);
}

// ─── 業務データ検索（lookup）の参照先 ────────────────────────────────────────
//
// ここは値の定義なので `"use server"` のモジュールに置いてはいけない
// （scripts/check-use-server-exports.sh が CI で落とす）。実際の検索関数は
// components/forms/lookup-dispatch.ts が source → Server Action で束ねる。

export type LookupSource =
  | "user"
  | "customer"
  | "product"
  | "material"
  | "material_type"
  | "process_step"
  | "plant"
  | "storage_location"
  | "work_location";

export const LOOKUP_SOURCES: { value: LookupSource; label: string }[] = [
  { value: "user", label: "ユーザー" },
  { value: "customer", label: "取引先" },
  { value: "product", label: "製品" },
  { value: "material", label: "素材" },
  { value: "material_type", label: "材種" },
  { value: "process_step", label: "工程" },
  { value: "plant", label: "拠点" },
  { value: "storage_location", label: "保管場所" },
  { value: "work_location", label: "作業場所" },
];

/**
 * lookup の値から参照先の詳細画面 URL を作る。null = リンクにしない。
 * kintone の商談メモで会社名・工場名がリンクになっているのと同じ役割。
 */
export function lookupHref(source: LookupSource, id: string): string | null {
  if (!id) return null;
  const enc = encodeURIComponent(id);
  switch (source) {
    case "user":
      return `/settings/users/${enc}`;
    case "customer":
      return `/master/business-partners/${enc}`;
    case "product":
      return `/master/products/${enc}`;
    case "material":
      return `/master/materials/${enc}`;
    case "material_type":
      return `/master/material-types/${enc}`;
    case "process_step":
      return `/master/process-steps/${enc}`;
    case "plant":
      return `/master/plants/${enc}`;
    case "storage_location":
      return `/master/storage-locations`;
    case "work_location":
      return `/master/work-locations`;
    default:
      return null;
  }
}

// ─── 定義 ────────────────────────────────────────────────────────────────────

export const FIELD_KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** 正規表現の長さ上限。長大なパターンは ReDoS の温床になるので定義保存時に弾く。 */
export const MAX_PATTERN_LENGTH = 200;
/** 1 項目に入れられる文字数の上限（実行時）。 */
export const MAX_TEXT_LENGTH = 10_000;
/** サブテーブルの最大行数。 */
export const MAX_TABLE_ROWS = 200;

export interface LocalizedLabel {
  ja: string;
  en: string;
}

export interface FormFieldOption {
  value: string;
  label: LocalizedLabel;
}

export interface RelatedConfig {
  /** 参照先フォームの code。 */
  targetFormCode: string;
  /** 参照先フォームで突き合わせる項目キー。 */
  targetFieldKey: string;
  /** このフォーム側で突き合わせる項目キー。 */
  thisFieldKey: string;
  /** 一覧に出す参照先の項目キー。 */
  columns: string[];
  limit: number;
}

export interface FormFieldDef {
  key: string;
  label: LocalizedLabel;
  type: FormFieldType;
  required: boolean;
  help?: string;
  placeholder?: string;
  /** select / multiselect */
  options?: FormFieldOption[];
  /** number */
  min?: number;
  max?: number;
  /** text / textarea */
  pattern?: string;
  patternMessage?: string;
  /** lookup */
  lookup?: { source: LookupSource };
  /** table（列定義。入れ子は 1 段まで） */
  columns?: FormFieldDef[];
  /** related */
  related?: RelatedConfig;
  order: number;
}

const localizedLabel = z.object({
  ja: z.string().min(1, "ラベル（日本語）を入力してください"),
  en: z.string(),
});

const fieldOption = z.object({
  value: z.string().min(1, "選択肢の値を入力してください"),
  label: localizedLabel,
});

const relatedConfig = z.object({
  targetFormCode: z.string().min(1, "参照先のフォームを選んでください"),
  targetFieldKey: z.string().min(1, "参照先の項目を選んでください"),
  thisFieldKey: z.string().min(1, "このフォーム側の項目を選んでください"),
  columns: z.array(z.string()).max(8, "表示する列は 8 つまでです"),
  limit: z.number().int().min(1).max(100),
});

const patternField = z
  .string()
  .max(MAX_PATTERN_LENGTH, `正規表現は ${MAX_PATTERN_LENGTH} 文字までです`)
  .refine((p) => isSafePattern(p), {
    message: "この正規表現は使えません（構文エラー、または入れ子の量指定）",
  });

/** 項目定義 1 件の zod。`table` の列は自分自身を 1 段だけ許す。 */
const baseFieldShape = {
  key: z
    .string()
    .regex(FIELD_KEY_PATTERN, "キーは英字で始まる英数字・_ のみ使えます"),
  label: localizedLabel,
  required: z.boolean(),
  help: z.string().optional(),
  placeholder: z.string().optional(),
  options: z.array(fieldOption).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: patternField.optional(),
  patternMessage: z.string().optional(),
  lookup: z
    .object({ source: z.enum(LOOKUP_SOURCES.map((s) => s.value)) })
    .optional(),
  related: relatedConfig.optional(),
  order: z.number().int(),
};

const columnFieldSchema = z.object({
  ...baseFieldShape,
  type: z.enum(
    FORM_FIELD_TYPES.filter((t) => isNestableFieldType(t.value)).map(
      (t) => t.value,
    ),
  ),
});

export const formFieldSchema = z.object({
  ...baseFieldShape,
  type: z.enum(FORM_FIELD_TYPES.map((t) => t.value)),
  columns: z.array(columnFieldSchema).optional(),
});

export const formFieldsSchema = z
  .array(formFieldSchema)
  .max(200, "項目は 200 個までです")
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.key)) {
        ctx.addIssue({
          code: "custom",
          message: `項目キー "${f.key}" が重複しています`,
        });
      }
      seen.add(f.key);
      if (f.type === "table") {
        const cols = new Set<string>();
        for (const c of f.columns ?? []) {
          if (cols.has(c.key)) {
            ctx.addIssue({
              code: "custom",
              message: `「${f.label.ja}」の列キー "${c.key}" が重複しています`,
            });
          }
          cols.add(c.key);
        }
      }
    }
  });

/**
 * 保存してよい正規表現か。構文エラーと、指数爆発の典型である
 * 「量指定の入れ子」（`(a+)+` など）を弾く。完全な ReDoS 検出は不可能なので、
 * これは足切りであって保証ではない — 実行時は入力長も MAX_TEXT_LENGTH で抑える。
 */
export function isSafePattern(pattern: string): boolean {
  if (pattern.length > MAX_PATTERN_LENGTH) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  // (...)+ / (...)* / (...){n,} の中にさらに量指定がある形を拒否する。
  return !/\([^()]*[+*}][^()]*\)\s*[+*]|\([^()]*[+*][^()]*\)\s*\{/.test(
    pattern,
  );
}

export function parseFormFields(
  value: unknown,
): { ok: true; fields: FormFieldDef[] } | { ok: false; error: string } {
  const parsed = formFieldsSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "項目定義が不正です",
    };
  }
  return { ok: true, fields: parsed.data as FormFieldDef[] };
}

/** 並び順を 0..n-1 に振り直す（ドラッグ後・削除後に必ず通す）。 */
export function normalizeOrder(fields: FormFieldDef[]): FormFieldDef[] {
  return [...fields]
    .sort((a, b) => a.order - b.order)
    .map((f, i) => ({ ...f, order: i }));
}

// ─── 値の検証 ────────────────────────────────────────────────────────────────

export type FormAnswerValue =
  | string
  | string[]
  | { id: string; label: string }
  | Record<string, unknown>[]
  | Record<string, unknown>
  | null
  | undefined;

function isBlank(v: FormAnswerValue): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object" && "id" in v) return !(v as { id: string }).id;
  return false;
}

/**
 * 1 項目の値を検証する。エラーメッセージ（日本語）か null を返す。
 * クライアントとサーバの両方がこれを呼ぶ。
 */
export function validateFieldValue(
  field: FormFieldDef,
  value: FormAnswerValue,
): string | null {
  const label = field.label.ja || field.key;

  // 関連レコード一覧は表示専用 — 値を持たない。
  if (field.type === "related") return null;

  if (isBlank(value)) {
    return field.required ? `${label} は必須です` : null;
  }

  switch (field.type) {
    case "number": {
      if (typeof value !== "string") return `${label} は数値で入力してください`;
      const n = Number(value);
      if (!Number.isFinite(n)) return `${label} は数値で入力してください`;
      if (field.min != null && n < field.min)
        return `${label} は ${field.min} 以上で入力してください`;
      if (field.max != null && n > field.max)
        return `${label} は ${field.max} 以下で入力してください`;
      return null;
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return `${label} は日付で入力してください`;
      return Number.isNaN(Date.parse(value))
        ? `${label} は日付で入力してください`
        : null;
    }
    case "time": {
      if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value))
        return `${label} は時刻（HH:MM）で入力してください`;
      const [h, m] = value.split(":").map(Number);
      return h < 24 && m < 60
        ? null
        : `${label} は時刻（HH:MM）で入力してください`;
    }
    case "select": {
      if (typeof value !== "string")
        return `${label} は選択肢から選んでください`;
      return (field.options ?? []).some((o) => o.value === value)
        ? null
        : `${label} は選択肢から選んでください`;
    }
    case "multiselect": {
      if (!Array.isArray(value)) return `${label} は選択肢から選んでください`;
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      return value.every((v) => typeof v === "string" && allowed.has(v))
        ? null
        : `${label} は選択肢から選んでください`;
    }
    case "lookup": {
      if (
        typeof value !== "object" ||
        value == null ||
        Array.isArray(value) ||
        typeof (value as { id?: unknown }).id !== "string"
      )
        return `${label} を選択してください`;
      return null;
    }
    case "attachment": {
      if (!Array.isArray(value)) return `${label} の添付が不正です`;
      return value.every((v) => typeof v === "string")
        ? null
        : `${label} の添付が不正です`;
    }
    case "table": {
      if (!Array.isArray(value)) return `${label} の行が不正です`;
      if (value.length > MAX_TABLE_ROWS)
        return `${label} は ${MAX_TABLE_ROWS} 行までです`;
      for (const [i, row] of value.entries()) {
        if (typeof row !== "object" || row == null)
          return `${label} の ${i + 1} 行目が不正です`;
        for (const col of field.columns ?? []) {
          const err = validateFieldValue(
            col,
            (row as Record<string, FormAnswerValue>)[col.key],
          );
          if (err) return `${label} の ${i + 1} 行目: ${err}`;
        }
      }
      return null;
    }
    case "richtext":
      // 本文の妥当性は lib/rich-text-core.ts parseRichText がサーバ側で見る。
      // ここでは「空でないこと」までを担当する。
      return null;
    default: {
      // text / textarea
      if (typeof value !== "string") return `${label} を入力してください`;
      if (value.length > MAX_TEXT_LENGTH)
        return `${label} は ${MAX_TEXT_LENGTH} 文字までです`;
      if (field.pattern && isSafePattern(field.pattern)) {
        try {
          if (!new RegExp(field.pattern).test(value))
            return field.patternMessage || `${label} の形式が正しくありません`;
        } catch {
          // 保存時に弾いている想定。ここまで来たら検証はスキップする。
        }
      }
      return null;
    }
  }
}

/** 回答全体を検証する。項目キー → エラーメッセージ。空なら妥当。 */
export function validateAnswers(
  fields: FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateFieldValue(field, answers[field.key]);
    if (err) errors[field.key] = err;
  }
  return errors;
}

/** 回答の平文射影（検索・監査ログの可読性のため）。 */
export function toPlainAnswers(
  fields: FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): string {
  const parts: string[] = [];
  const render = (field: FormFieldDef, value: FormAnswerValue): string => {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      if (field.type === "table") {
        return (value as Record<string, FormAnswerValue>[])
          .map((row) =>
            (field.columns ?? [])
              .map((c) => render(c, row[c.key]))
              .filter(Boolean)
              .join(" "),
          )
          .filter(Boolean)
          .join(" / ");
      }
      return value.filter((v) => typeof v === "string").join(", ");
    }
    if (typeof value === "object" && "label" in value)
      return String((value as { label: unknown }).label ?? "");
    return "";
  };
  for (const field of fields) {
    const text = render(field, answers[field.key]).trim();
    if (text) parts.push(`${field.label.ja}: ${text}`);
  }
  return parts.join("\n");
}

// ─── 受付期間・編集期限 ──────────────────────────────────────────────────────

export type FormAvailability =
  | "DRAFT"
  | "SCHEDULED"
  | "OPEN"
  | "CLOSED"
  | "ARCHIVED";

export interface FormWindow {
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  opensAt: Date | null;
  closesAt: Date | null;
}

/**
 * いま回答を受け付けているか。**status に CLOSED は持たせない** — 締切は
 * バッチではなく毎リクエストのこの評価で閉じる（そのために cron は増やさない）。
 */
export function formAvailability(
  form: FormWindow,
  now: Date,
): FormAvailability {
  if (form.status === "DRAFT") return "DRAFT";
  if (form.status === "ARCHIVED") return "ARCHIVED";
  if (form.opensAt && now < form.opensAt) return "SCHEDULED";
  if (form.closesAt && now >= form.closesAt) return "CLOSED";
  return "OPEN";
}

export const AVAILABILITY_LABEL: Record<FormAvailability, string> = {
  DRAFT: "下書き",
  SCHEDULED: "受付前",
  OPEN: "受付中",
  CLOSED: "受付終了",
  ARCHIVED: "アーカイブ",
};

export interface EditWindow extends FormWindow {
  responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
  responseEditableUntil: Date | null;
}

/**
 * 提出済みの回答を本人が編集できるか。
 * **必ずサーバ側でも呼ぶこと** — 画面のボタンを無効にしただけでは、期限後の
 * 更新リクエストを素通しする。
 */
export function canEditResponse(
  form: EditWindow,
  response: { submittedBy: string; status: string },
  userId: string,
  now: Date,
): boolean {
  if (response.submittedBy !== userId) return false;
  // 下書きと差し戻しは期限に関係なく本人が直せる（まだ出していない/戻された）。
  if (response.status === "DRAFT" || response.status === "REJECTED")
    return true;
  // 承認フローに乗って動き出したものは、この経路では触らせない。
  if (response.status === "REQUESTED" || response.status === "APPROVED")
    return false;
  switch (form.responseEditMode) {
    case "UNTIL_CLOSE":
      return !form.closesAt || now < form.closesAt;
    case "UNTIL_DATE":
      return !!form.responseEditableUntil && now < form.responseEditableUntil;
    default:
      return false;
  }
}

/** 編集期限の説明文（画面に出す）。編集不可なら null。 */
export function editDeadlineOf(form: EditWindow): Date | null {
  switch (form.responseEditMode) {
    case "UNTIL_CLOSE":
      return form.closesAt;
    case "UNTIL_DATE":
      return form.responseEditableUntil;
    default:
      return null;
  }
}
