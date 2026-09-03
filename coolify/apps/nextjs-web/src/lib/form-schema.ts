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
import type { Tr } from "./i18n";

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

/** 項目型のキーだけの一覧（zod の enum・型チェック用。表示名は持たない）。 */
export const FORM_FIELD_TYPE_VALUES: readonly FormFieldType[] = [
  "text",
  "textarea",
  "richtext",
  "number",
  "date",
  "time",
  "select",
  "multiselect",
  "lookup",
  "attachment",
  "table",
  "related",
];

/** 項目型の選択肢（ビルダーの型セレクタ用）。呼び出し側の `tr` を渡す。 */
export function formFieldTypes(
  tr: Tr,
): { value: FormFieldType; label: string }[] {
  return [
    { value: "text", label: tr("general.formSchema.oneLineText") },
    { value: "textarea", label: tr("general.formSchema.multiLineText") },
    { value: "richtext", label: tr("general.formSchema.richText") },
    { value: "number", label: tr("common.numericValue") },
    { value: "date", label: tr("common.date") },
    { value: "time", label: tr("common.time") },
    { value: "select", label: tr("general.formSchema.dropdownSingleSelect") },
    { value: "multiselect", label: tr("common.multiSelect") },
    { value: "lookup", label: tr("common.businessDataLookup") },
    { value: "attachment", label: tr("common.attachment") },
    { value: "table", label: tr("general.formSchema.subTableRepeatableRows") },
    { value: "related", label: tr("general.formSchema.relatedRecords") },
  ];
}

/** サブテーブルの列に置けない型（入れ子は 1 段までにする）。 */
const NOT_NESTABLE: ReadonlySet<FormFieldType> = new Set([
  "table",
  "related",
  "richtext",
]);

export function isNestableFieldType(type: FormFieldType): boolean {
  return !NOT_NESTABLE.has(type);
}

/**
 * 一覧の見出し（CM02 の回答一覧・CM01 の回答行）に使えない型。値が複雑すぎて
 * 一行の文字列にならない、または値そのものを持たない型を外す。
 */
const NOT_TITLEABLE: ReadonlySet<FormFieldType> = new Set([
  "richtext",
  "attachment",
  "table",
  "related",
]);

export function canBeTitleField(type: FormFieldType): boolean {
  return !NOT_TITLEABLE.has(type);
}

// ─── 業務データ検索（lookup）の参照先 ────────────────────────────────────────
//
// ここは値の定義なので `"use server"` のモジュールに置いてはいけない
// （scripts/check-use-server-exports.sh が CI で落とす）。実際の検索関数は
// components/forms/lookup-dispatch.ts が source → Server Action で束ねる。

export type LookupSource =
  | "user"
  | "customer"
  | "business_partner"
  | "product"
  | "material"
  | "material_type"
  | "process_step"
  | "plant"
  | "storage_location"
  | "work_location";

/** 呼び出し側の `tr` を渡す。 */
export function lookupSources(
  tr: Tr,
): { value: LookupSource; label: string }[] {
  return [
    { value: "user", label: tr("general.formSchema.lookupSourceUser") },
    {
      value: "customer",
      label: tr("general.formSchema.lookupSourceCustomer"),
    },
    // 支店・工場まで含めて引く。customer は parentId=null（本社）だけなので、
    // 「顧客の◯◯工場」を選びたいときはこちら。
    {
      value: "business_partner",
      label: tr("general.formSchema.lookupSourceBusinessPartner"),
    },
    { value: "product", label: tr("general.formSchema.lookupSourceProduct") },
    {
      value: "material",
      label: tr("general.formSchema.lookupSourceMaterial"),
    },
    {
      value: "material_type",
      label: tr("general.formSchema.lookupSourceMaterialType"),
    },
    {
      value: "process_step",
      label: tr("general.formSchema.lookupSourceProcessStep"),
    },
    { value: "plant", label: tr("general.formSchema.lookupSourcePlant") },
    {
      value: "storage_location",
      label: tr("general.formSchema.lookupSourceStorageLocation"),
    },
    {
      value: "work_location",
      label: tr("general.formSchema.lookupSourceWorkLocation"),
    },
  ];
}

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
    case "business_partner":
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
  /**
   * 一覧（CM02 の回答一覧・CM01 の回答行）の見出しに使う項目か。
   * フォームにつき最大 1 つ（`formFieldsSchema` の superRefine が強制する）。
   * サブテーブルの列には意味を持たせない — ビルダーはトップレベルの項目にしか
   * 見せない。
   */
  isTitle?: boolean;
}

function localizedLabel(tr: Tr) {
  return z.object({
    ja: z.string().min(1, tr("general.formSchema.enterLabelJa")),
    en: z.string(),
  });
}

function fieldOption(tr: Tr) {
  return z.object({
    value: z.string().min(1, tr("general.formSchema.enterChoiceValue")),
    label: localizedLabel(tr),
  });
}

function relatedConfig(tr: Tr) {
  return z.object({
    targetFormCode: z
      .string()
      .min(1, tr("general.formSchema.selectTargetForm")),
    targetFieldKey: z
      .string()
      .min(1, tr("general.formSchema.selectTargetField")),
    thisFieldKey: z
      .string()
      .min(1, tr("general.formSchema.selectThisFormField")),
    columns: z
      .array(z.string())
      .max(8, tr("general.formSchema.upToNColumns", { n: 8 })),
    limit: z.number().int().min(1).max(100),
  });
}

function patternField(tr: Tr) {
  return z
    .string()
    .max(
      MAX_PATTERN_LENGTH,
      tr("general.formSchema.patternMaxLength", { max: MAX_PATTERN_LENGTH }),
    )
    .refine((p) => isSafePattern(p), {
      message: tr("general.formSchema.unsafePattern"),
    });
}

/** 項目定義 1 件の zod。`table` の列は自分自身を 1 段だけ許す。 */
function baseFieldShape(tr: Tr) {
  return {
    key: z
      .string()
      .regex(FIELD_KEY_PATTERN, tr("general.formSchema.keyFormat")),
    label: localizedLabel(tr),
    required: z.boolean(),
    help: z.string().optional(),
    placeholder: z.string().optional(),
    options: z.array(fieldOption(tr)).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: patternField(tr).optional(),
    patternMessage: z.string().optional(),
    lookup: z
      .object({ source: z.enum(lookupSources(tr).map((s) => s.value)) })
      .optional(),
    related: relatedConfig(tr).optional(),
    order: z.number().int(),
    isTitle: z.boolean().optional(),
  };
}

function columnFieldSchema(tr: Tr) {
  return z.object({
    ...baseFieldShape(tr),
    type: z.enum(FORM_FIELD_TYPE_VALUES.filter(isNestableFieldType)),
  });
}

export function formFieldSchema(tr: Tr) {
  return z.object({
    ...baseFieldShape(tr),
    type: z.enum(FORM_FIELD_TYPE_VALUES),
    columns: z.array(columnFieldSchema(tr)).optional(),
  });
}

export function formFieldsSchema(tr: Tr) {
  return z
    .array(formFieldSchema(tr))
    .max(200, tr("general.formSchema.upToNFields", { n: 200 }))
    .superRefine((fields, ctx) => {
      const seen = new Set<string>();
      const titleFields = fields.filter((f) => f.isTitle);
      if (titleFields.length > 1) {
        ctx.addIssue({
          code: "custom",
          message: tr("general.formSchema.onlyOneTitleField"),
        });
      }
      for (const f of titleFields) {
        if (!canBeTitleField(f.type)) {
          ctx.addIssue({
            code: "custom",
            message: tr("general.formSchema.cannotBeTitleField", {
              label: f.label.ja,
            }),
          });
        }
      }
      for (const f of fields) {
        if (seen.has(f.key)) {
          ctx.addIssue({
            code: "custom",
            message: tr("general.formSchema.duplicateFieldKey", {
              key: f.key,
            }),
          });
        }
        seen.add(f.key);
        if (f.type === "table") {
          const cols = new Set<string>();
          for (const c of f.columns ?? []) {
            if (cols.has(c.key)) {
              ctx.addIssue({
                code: "custom",
                message: tr("general.formSchema.duplicateColumnKey", {
                  label: f.label.ja,
                  key: c.key,
                }),
              });
            }
            cols.add(c.key);
          }
        }
      }
    });
}

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
  tr: Tr,
): { ok: true; fields: FormFieldDef[] } | { ok: false; error: string } {
  const parsed = formFieldsSchema(tr).safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue?.message ?? tr("general.formSchema.invalidFieldDefinition");
    // 何番目の項目でこけたのかを言う。「ラベルを入力してください」だけだと、
    // 項目が 20 個あるフォームでどれを直せばいいのか分からない。
    const index = typeof issue?.path?.[0] === "number" ? issue.path[0] : null;
    return {
      ok: false,
      error:
        index === null
          ? message
          : tr("general.formSchema.itemIndexPrefix", {
              index: index + 1,
              message,
            }),
    };
  }
  return { ok: true, fields: parsed.data as FormFieldDef[] };
}

/** 項目定義の JSON（form_versions.schema）を項目配列に戻す。壊れていたら空配列。 */
export function fieldsFromSchema(schema: unknown, tr: Tr): FormFieldDef[] {
  const parsed = parseFormFields(schema, tr);
  return parsed.ok ? parsed.fields : [];
}

/**
 * 新しい項目に割り当てる既定のキー。`field1`, `field2`, … で、既存と衝突しない
 * ものを返す。空キーで作ると、追加した直後の項目が常に検証エラーになり、
 * 「追加したのに保存できない」状態から始まってしまう。
 */
export function nextFieldKey(existingKeys: readonly string[]): string {
  const taken = new Set(existingKeys);
  for (let n = existingKeys.length + 1; n < existingKeys.length + 1000; n++) {
    const candidate = `field${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `field${Date.now()}`;
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
 * 1 項目の値を検証する。エラーメッセージ（画面の言語）か null を返す。
 * クライアントとサーバの両方がこれを呼ぶ。
 */
export function validateFieldValue(
  field: FormFieldDef,
  value: FormAnswerValue,
  tr: Tr,
): string | null {
  const label = field.label.ja || field.key;
  const e = (key: string, vars?: Record<string, unknown>) =>
    tr(`general.formSchema.${key}`, { label, ...vars });

  // 関連レコード一覧は表示専用 — 値を持たない。
  if (field.type === "related") return null;

  if (isBlank(value)) {
    return field.required ? e("fieldRequired") : null;
  }

  switch (field.type) {
    case "number": {
      if (typeof value !== "string") return e("fieldEnterNumber");
      const n = Number(value);
      if (!Number.isFinite(n)) return e("fieldEnterNumber");
      if (field.min != null && n < field.min)
        return e("fieldMinNumber", { min: field.min });
      if (field.max != null && n > field.max)
        return e("fieldMaxNumber", { max: field.max });
      return null;
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        return e("fieldEnterDate");
      return Number.isNaN(Date.parse(value)) ? e("fieldEnterDate") : null;
    }
    case "time": {
      if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value))
        return e("fieldEnterTime");
      const [h, m] = value.split(":").map(Number);
      return h < 24 && m < 60 ? null : e("fieldEnterTime");
    }
    case "select": {
      if (typeof value !== "string") return e("fieldSelectFromOptions");
      return (field.options ?? []).some((o) => o.value === value)
        ? null
        : e("fieldSelectFromOptions");
    }
    case "multiselect": {
      if (!Array.isArray(value)) return e("fieldSelectFromOptions");
      const allowed = new Set((field.options ?? []).map((o) => o.value));
      return value.every((v) => typeof v === "string" && allowed.has(v))
        ? null
        : e("fieldSelectFromOptions");
    }
    case "lookup": {
      if (
        typeof value !== "object" ||
        value == null ||
        Array.isArray(value) ||
        typeof (value as { id?: unknown }).id !== "string"
      )
        return e("fieldSelectRequired");
      return null;
    }
    case "attachment": {
      if (!Array.isArray(value)) return e("fieldInvalidAttachment");
      return value.every((v) => typeof v === "string")
        ? null
        : e("fieldInvalidAttachment");
    }
    case "table": {
      if (!Array.isArray(value)) return e("fieldInvalidRow");
      if (value.length > MAX_TABLE_ROWS)
        return e("fieldUpToNRows", { n: MAX_TABLE_ROWS });
      for (const [i, row] of value.entries()) {
        if (typeof row !== "object" || row == null)
          return e("fieldInvalidRowAt", { row: i + 1 });
        for (const col of field.columns ?? []) {
          const err = validateFieldValue(
            col,
            (row as Record<string, FormAnswerValue>)[col.key],
            tr,
          );
          if (err) return e("fieldRowError", { row: i + 1, error: err });
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
      if (typeof value !== "string") return e("fieldEnterValue");
      if (value.length > MAX_TEXT_LENGTH)
        return e("fieldUpToNChars", { n: MAX_TEXT_LENGTH });
      if (field.pattern && isSafePattern(field.pattern)) {
        try {
          if (!new RegExp(field.pattern).test(value))
            return field.patternMessage || e("fieldInvalidFormat");
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
  tr: Tr,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const err = validateFieldValue(field, answers[field.key], tr);
    if (err) errors[field.key] = err;
  }
  return errors;
}

/**
 * 1 項目の値を平文にする（`toPlainAnswers` と一覧の見出し抽出が共有する）。
 * `table` は列を再帰的に平文化して 1 行にまとめる。
 */
function renderFieldPlainValue(
  field: FormFieldDef,
  value: FormAnswerValue,
): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (field.type === "table") {
      return (value as Record<string, FormAnswerValue>[])
        .map((row) =>
          (field.columns ?? [])
            .map((c) => renderFieldPlainValue(c, row[c.key]))
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
}

/** 回答の平文射影（検索・監査ログの可読性のため）。 */
export function toPlainAnswers(
  fields: FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const text = renderFieldPlainValue(field, answers[field.key]).trim();
    if (text) parts.push(`${field.label.ja}: ${text}`);
  }
  return parts.join("\n");
}

/** 一覧の見出しに指定された項目（`isTitle: true`）。無ければ null。 */
export function titleFieldOf(fields: FormFieldDef[]): FormFieldDef | null {
  return fields.find((f) => f.isTitle && canBeTitleField(f.type)) ?? null;
}

/**
 * 一覧の見出しに使う文字列。見出し項目が未設定、または未回答なら空文字を
 * 返す — 呼び出し側で「内容」の旧来のフォールバック（先頭 2 項目）に落とす。
 */
export function titleTextOf(
  fields: FormFieldDef[],
  answers: Record<string, FormAnswerValue>,
): string {
  const field = titleFieldOf(fields);
  if (!field) return "";
  return renderFieldPlainValue(field, answers[field.key]).trim();
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

export function availabilityLabel(tr: Tr): Record<FormAvailability, string> {
  return {
    DRAFT: tr("general.formSchema.availabilityDraft"),
    SCHEDULED: tr("general.formSchema.availabilityScheduled"),
    OPEN: tr("general.formSchema.availabilityOpen"),
    CLOSED: tr("general.formSchema.availabilityClosed"),
    ARCHIVED: tr("general.formSchema.availabilityArchived"),
  };
}

export interface EditWindow extends FormWindow {
  responseEditMode: "NONE" | "UNTIL_CLOSE" | "UNTIL_DATE";
  responseEditableUntil: Date | null;
  /**
   * 承認依頼中でも、**最初の承認が下りるまで**は本人が直せる。
   * 既定（false / 未指定）は依頼した時点で締める。
   */
  editableUntilFirstApproval?: boolean;
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
  /** 承認が 1 つでも下りているか（サーバが数えて渡す）。 */
  firstApprovalDone = false,
): boolean {
  if (response.submittedBy !== userId) return false;
  // 下書きと差し戻しは期限に関係なく本人が直せる（まだ出していない/戻された）。
  // **差し戻しは常に直せる** — 直して出し直すための状態なので、
  // editableUntilFirstApproval の設定や受付期間には左右されない。
  if (response.status === "DRAFT" || response.status === "REJECTED")
    return true;
  // 承認済みは触らせない（承認した中身が後から変わってはいけない）。
  if (response.status === "APPROVED") return false;
  if (response.status === "REQUESTED") {
    // 依頼中の既定は「締める」。設定が入っているときだけ、**誰も承認して
    // いないうち**は直せる — 1 人でも承認したあとに中身が変わると、その承認が
    // 何に対するものだったのか分からなくなるため、そこで必ず締める。
    return form.editableUntilFirstApproval === true && !firstApprovalDone;
  }
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

/**
 * 提出したときに承認依頼まで自動で通すか。
 *
 * **提出＝申請**にするための判定。以前は提出後に本人が回答詳細を開いて
 * 「承認依頼」を押す必要があり、その一手間が忘れられて申請が滞留していた。
 *
 * 対象は申請・報告フォームで承認フローを使う設定のものだけ。起こす条件は
 * 「いま出した」に相当するもの:
 *   - 新規に提出した（prevStatus なし）
 *   - 下書きを提出に切り替えた
 *   - 差し戻された回答を直して保存した（＝再依頼）
 *   - 提出済みのまま止まっている回答を保存し直した
 *
 * 最後の 1 つは**取りこぼしの回収**。承認フローが未設定のまま提出された回答は
 * SUBMITTED で止まり、手動の承認依頼ボタンはもう無い。フローを設定したあとに
 * 本人が開いて保存し直せば流れ出す、という逃げ道をここで用意しておく。
 *
 * **承認依頼中（REQUESTED）の編集では起こさない。** フォームの設定
 * `editableUntilFirstApproval` で初回承認前だけ直せる場合があるが、そこで
 * フローを張り直すと進行中の依頼と承認枠を捨てることになる。
 *
 * 承認済み（APPROVED）はそもそも編集できないので、ここへは来ない。
 */
export function shouldAutoRequestApproval(
  form: { kind: string; approvalEnabled: boolean },
  /** 保存前の状態。新規提出では null。 */
  prevStatus: string | null,
  asDraft: boolean,
): boolean {
  if (asDraft) return false;
  if (form.kind !== "REQUEST" || !form.approvalEnabled) return false;
  return (
    prevStatus === null ||
    prevStatus === "DRAFT" ||
    prevStatus === "REJECTED" ||
    prevStatus === "SUBMITTED"
  );
}

/**
 * その回答は「完了した申請・報告」か。完了通知（lib/form-completion.ts）と
 * CM01「完了した申請」の唯一の判定元。
 *
 * 完了の意味はフォームの設定で変わる:
 *   - 承認フローを使う   … 全段の承認が下りた（APPROVED）
 *   - 承認フローを使わない … 提出そのもの（SUBMITTED）— 日報・点検簿など、
 *     承認を挟まない「報告」はここで終わりだから
 *
 * アンケート（SURVEY）に完了は無い。承認を使う設定なのに SUBMITTED で
 * 止まっているもの（フロー未設定など）も完了ではない — 出しただけで、
 * 通すべき承認をまだ通っていない。
 */
export function isCompletedRequest(
  form: { kind: string; approvalEnabled: boolean },
  status: string,
): boolean {
  if (form.kind !== "REQUEST") return false;
  return form.approvalEnabled ? status === "APPROVED" : status === "SUBMITTED";
}
