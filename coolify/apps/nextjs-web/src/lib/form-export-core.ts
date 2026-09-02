/**
 * form-export-core.ts — 回答の書き出し（Excel / PDF）で共有する純粋ロジック。
 *
 * ここが持つのは 2 つだけ:
 *   1. **絞り込み** — 状態・提出日で回答を選ぶ（画面と route handler の両方が使う）
 *   2. **平坦化** — 1 回答 = 1 行の表にするために、答えを 1 つの文字列へ畳む
 *
 * 平坦化の規則は **`analytics.v_form_answers`（shared-db/sql/analytics-views.sql）
 * と同じ**にしてある。Excel に落とした値と Metabase で見える値が食い違うと、
 * 「どっちが正しいのか」を毎回確かめることになるため。片方を変えたら
 * もう片方も直すこと。
 *
 * 純粋関数だけを置く（I/O なし）。route handler は Prisma から読んだ行を
 * ここへ渡すだけにして、判断は全部こちらでテストする。
 */

import type { getTranslations } from "next-intl/server";
import type { FormAnswerValue, FormFieldDef } from "./form-schema";

type Tr = Awaited<ReturnType<typeof getTranslations>>;

// ── 絞り込み ────────────────────────────────────────────────────────────────

/** 書き出しの対象にできる状態（下書きは本人以外に見えないので入れない）。 */
export const EXPORTABLE_STATUSES = [
  "SUBMITTED",
  "REQUESTED",
  "APPROVED",
  "REJECTED",
] as const;
export type ExportableStatus = (typeof EXPORTABLE_STATUSES)[number];

export interface ExportFilter {
  /** 空 = すべての状態。 */
  statuses: string[];
  /** 提出日の下限（この日を含む）。null = 下限なし。 */
  from: Date | null;
  /** 提出日の上限（この日を含む）。null = 上限なし。 */
  to: Date | null;
  /** 列に出す項目キー。空 = すべての項目。 */
  fieldKeys: string[];
}

export const EMPTY_EXPORT_FILTER: ExportFilter = {
  statuses: [],
  from: null,
  to: null,
  fieldKeys: [],
};

export interface ExportableResponse {
  responseNumber: string;
  recordNo: number;
  status: string;
  /** respondentVisibility=HIDDEN のときは null（サーバ側で落としてから渡す）。 */
  respondent: string | null;
  submittedAt: Date | null;
  createdAt: Date;
  answers: Record<string, FormAnswerValue>;
}

/**
 * 絞り込みに当てはまるか。
 *
 * 提出日で絞るとき、**まだ提出していない回答は落とす** — 「3 月に出たもの」を
 * 求めている人に、提出日の無い行を混ぜても読めない。
 */
export function matchesExportFilter(
  response: Pick<ExportableResponse, "status" | "submittedAt">,
  filter: ExportFilter,
): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(response.status))
    return false;
  if (filter.from || filter.to) {
    if (!response.submittedAt) return false;
    if (filter.from && response.submittedAt < filter.from) return false;
    if (filter.to && response.submittedAt > filter.to) return false;
  }
  return true;
}

/**
 * 「この日まで」を、その日の終わりに直す。
 *
 * 画面で 3/31 を選んだ人は 3/31 に出したものを含めたい。日付をそのまま
 * 上限にすると 3/31 00:00 より後が全部落ちるので、23:59:59.999 まで伸ばす。
 */
export function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

// ── 平坦化 ──────────────────────────────────────────────────────────────────

/** ラベルの解決（ja → en → キー）。v_form_answers の coalesce と同じ順。 */
export function fieldLabel(field: FormFieldDef): string {
  return field.label.ja || field.label.en || field.key;
}

function optionLabel(field: FormFieldDef, value: string): string {
  const option = field.options?.find((o) => o.value === value);
  return option ? option.label.ja || option.label.en || option.value : value;
}

/** 1 つの値を文字列へ。配列・オブジェクトの畳み方が v_form_answers と揃っている。 */
function scalar(field: FormFieldDef, value: FormAnswerValue): string {
  if (value == null) return "";
  if (typeof value === "string") {
    // 選択肢は保存値ではなくラベルを出す（値は人が読めない）。
    return field.type === "select" ? optionLabel(field, value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (v == null) return "";
        if (typeof v === "string")
          return field.type === "multiselect" ? optionLabel(field, v) : v;
        if (typeof v === "object") {
          const o = v as Record<string, unknown>;
          // 業務データ検索・添付は保存済みのラベル（無ければ id）。
          const label = o.label ?? o.name ?? o.filename ?? o.id;
          return typeof label === "string" ? label : "";
        }
        return String(v);
      })
      .filter((s) => s !== "")
      .join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const label = o.label ?? o.name ?? o.filename ?? o.id;
    return typeof label === "string" ? label : "";
  }
  return "";
}

/**
 * 回答 1 項目ぶんを、表の 1 セルに入る文字列へ畳む。
 *
 * - `richtext` は本文の平文だけを出す（書式は表計算に持ち込めない）
 * - `table`（サブテーブル）は「列=値」を ` / ` で繋ぎ、行を改行で並べる。
 *   1 セルに収めるのは、行数がフォームごと・回答ごとに変わるため — 列を
 *   増やすと同じフォームの回答が別々の形になってしまう
 * - `related` は値を持たない表示専用の項目なので常に空
 */
export function answerToCellText(
  field: FormFieldDef,
  value: FormAnswerValue,
): string {
  if (field.type === "related") return "";
  if (value == null) return "";

  if (field.type === "richtext") return richTextToPlain(value);

  if (field.type === "table") {
    const rows = Array.isArray(value)
      ? (value as Record<string, FormAnswerValue>[])
      : [];
    const columns = field.columns ?? [];
    return rows
      .map((row) =>
        columns
          .map((c) => {
            const cell = scalar(c, row[c.key]);
            return cell === "" ? "" : `${fieldLabel(c)}=${cell}`;
          })
          .filter((s) => s !== "")
          .join(" / "),
      )
      .filter((s) => s !== "")
      .join("\n");
  }

  return scalar(field, value);
}

/**
 * ProseMirror ドキュメントから平文を取り出す。
 *
 * lib/rich-text-core.ts にも平文射影があるが、あちらは保存時の検証込みで
 * server 寄りの都合を持つ。ここは「読めれば十分」なので、text ノードを
 * 拾って段落で改行するだけにしてある。
 */
function richTextToPlain(value: FormAnswerValue): string {
  const walk = (node: unknown): string => {
    if (node == null || typeof node !== "object") return "";
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (typeof n.text === "string") return n.text;
    const inner = Array.isArray(n.content) ? n.content.map(walk).join("") : "";
    // 段落・見出し・リスト項目は行として区切る。
    return n.type && /^(paragraph|heading|listItem|blockquote)$/.test(n.type)
      ? `${inner}\n`
      : inner;
  };
  return walk(value)
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * 数値として表に入れられるか（Excel で集計できるように型を保つ）。
 *
 * `FormAnswerValue` の型に `number` は入っていないが、**実際の JSON には
 * 数値がそのまま入りうる**（v_form_answers も `jsonb_typeof = 'number'` を
 * 扱っているし、集計 form-summary.ts も両方を受ける）。型が実態より狭いので、
 * 文字列と数値の両方を受けておく。
 */
export function numericAnswer(
  field: FormFieldDef,
  value: FormAnswerValue,
): number | null {
  if (field.type !== "number") return null;
  const n = typeof value === "number" ? value : Number(value);
  return typeof value === "boolean" || value == null || value === ""
    ? null
    : Number.isFinite(n)
      ? n
      : null;
}

// ── 列の組み立て ────────────────────────────────────────────────────────────

/** 固定列の id（回答そのものではなく、どの回答かを示す列）。並びは表示順。 */
export const FIXED_EXPORT_COLUMN_IDS = [
  "no",
  "responseNumber",
  "status",
  "respondent",
  "submittedAt",
] as const;
export type FixedExportColumnId = (typeof FIXED_EXPORT_COLUMN_IDS)[number];

/** 固定列（id + 見出し）。並びは FIXED_EXPORT_COLUMN_IDS の順。 */
export function fixedExportColumns(
  tr: Tr,
): { id: FixedExportColumnId; header: string }[] {
  const headers: Record<FixedExportColumnId, string> = {
    no: "No.",
    responseNumber: tr("common.responseNumber"),
    status: tr("common.status"),
    respondent: tr("common.respondent"),
    submittedAt: tr("common.submittedAt"),
  };
  return FIXED_EXPORT_COLUMN_IDS.map((id) => ({ id, header: headers[id] }));
}

/**
 * 書き出す項目を選ぶ。
 *
 * `related` は値を持たないので常に外す。`fieldKeys` が空なら「すべて」。
 * 並びは常に定義順 — 利用者がチェックを入れた順に列が動くと、同じフォームの
 * 書き出しが毎回違う形になる。
 */
export function exportFields(
  fields: readonly FormFieldDef[],
  fieldKeys: readonly string[],
): FormFieldDef[] {
  const wanted = new Set(fieldKeys);
  return fields.filter(
    (f) => f.type !== "related" && (wanted.size === 0 || wanted.has(f.key)),
  );
}

// ── URL パラメータ ──────────────────────────────────────────────────────────
//
// 絞り込みは画面（ダウンロードのモーダル）で組み立て、route handler が読み直す。
// **同じ 1 つの規約を両側が使う**ようにここへ置く — 片側だけ直すと、画面の
// 表示と実際に落ちてくるファイルが静かに食い違う。
//
//   status=SUBMITTED,APPROVED   状態（カンマ区切り。空 = すべて）
//   from=2026-03-01             提出日の下限（YYYY-MM-DD）
//   to=2026-03-31               提出日の上限（同上。その日の終わりまで含む）
//   fields=k1,k2                列に出す項目（空 = すべて）

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

function parseDateParam(value: string | null): Date | null {
  if (!value || !DATE_PARAM.test(value)) return null;
  // ローカル時間の 0 時として読む（利用者が選んだのは暦の日付であって瞬間ではない）。
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseList(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** `YYYY-MM-DD`（ローカル時間）。 */
export function toDateParam(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function parseExportFilter(params: URLSearchParams): ExportFilter {
  const to = parseDateParam(params.get("to"));
  return {
    // 知らない状態名は落とす（URL を書き換えて下書きを引き出せないように）。
    statuses: parseList(params.get("status")).filter((s) =>
      (EXPORTABLE_STATUSES as readonly string[]).includes(s),
    ),
    from: parseDateParam(params.get("from")),
    to: to ? endOfDay(to) : null,
    fieldKeys: parseList(params.get("fields")),
  };
}

export function exportFilterToParams(filter: {
  statuses: string[];
  from: Date | null;
  to: Date | null;
  fieldKeys: string[];
}): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.statuses.length > 0)
    params.set("status", filter.statuses.join(","));
  if (filter.from) params.set("from", toDateParam(filter.from));
  if (filter.to) params.set("to", toDateParam(filter.to));
  if (filter.fieldKeys.length > 0)
    params.set("fields", filter.fieldKeys.join(","));
  return params;
}
