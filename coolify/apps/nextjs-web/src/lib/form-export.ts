import "server-only";

/**
 * form-export.ts — 回答の書き出し（Excel / まとめ印刷）のためのデータ読み出し。
 *
 * 判断そのものは lib/form-export-core.ts（純粋・テスト済み）が持ち、ここは
 * **権限を見て、DB から読んで、渡す**だけ。route handler を薄く保つのは、
 * 見落とすと事故になる 2 つの門をここ 1 か所に集めるため:
 *
 *   1. 共有スコープ（responseInScope）— 条件付き共有の人には条件に合う回答だけ
 *   2. 回答者の匿名（respondentVisibility=HIDDEN）— 名前は **props に載せない**
 *
 * この 2 つはアプリの他の入口（一覧・詳細・集計）にも同じ規則で入っている。
 * 書き出しだけ緩いと、画面で隠したものがファイルで漏れる。
 */

import { prisma } from "./db";
import {
  answerToCellText,
  type ExportableResponse,
  type ExportFilter,
  exportFields,
  fieldLabel,
  matchesExportFilter,
  numericAnswer,
} from "./form-export-core";
import type { FormAnswerValue, FormFieldDef } from "./form-schema";
import {
  type FormDetailView,
  fetchForm,
  fetchFormVersionFields,
  formAccess,
} from "./forms";
import type { Locale } from "./i18n";
import { label } from "./messages";
import { responseInScope } from "./share-grants-core";

/**
 * 1 回のまとめ書き出しで扱う上限。
 *
 * 集計画面（5000）より小さくしてあるのは、こちらが 1 行ずつ XML / HTML を
 * 組み立てるため。超えた分は黙って切らず、呼び出し側が利用者に伝える。
 */
export const MAX_EXPORT_ROWS = 2000;

export interface FormExportData {
  form: FormDetailView;
  /** 列に出す項目（定義順・related は除く。古い版だけにある項目も含む）。 */
  fields: FormFieldDef[];
  responses: ExportableResponse[];
  /**
   * 上限に当たって全件は入っていない。**件数ではなく真偽で持つ** — 上限 +1 件
   * までしか読んでいないので、あと何件あるかはここでは分からない。
   */
  hasMore: boolean;
}

/**
 * 書き出す回答を集める。読めない・共有されていなければ null。
 *
 * **列は「今の版の項目」だけでは足りない。** 項目を消したあとも過去の回答は
 * その値を持っているので、消された項目の列が無いと黙って落ちる。今の版の順に
 * 並べたあと、古い版にしか無い項目を後ろへ足す。
 */
export async function loadFormExport(
  code: string,
  filter: ExportFilter,
  viewerId: string | null,
): Promise<FormExportData | null> {
  const detail = await fetchForm(code);
  if (!detail) return null;

  const form = await prisma.form
    .findUnique({ where: { code }, select: { id: true } })
    .catch(() => null);
  if (!form) return null;

  // 集計と同じ門 — 「回答できる」だけでは足りず、閲覧以上が要る。
  const access = await formAccess(detail);
  if (!access.canRead) return null;

  const rows = await prisma.formResponse.findMany({
    where: { formId: form.id, status: { not: "DRAFT" } },
    orderBy: { recordNo: "asc" },
    take: MAX_EXPORT_ROWS + 1,
    select: {
      responseNumber: true,
      recordNo: true,
      status: true,
      version: true,
      answers: true,
      submittedAt: true,
      createdAt: true,
      submittedBy: true,
      submittedByUser: { select: { displayName: true, username: true } },
    },
  });

  const hidden = detail.respondentVisibility === "HIDDEN";
  const visible = rows.filter((r) => {
    const answers = (r.answers ?? {}) as Record<string, FormAnswerValue>;
    const mine = viewerId != null && r.submittedBy === viewerId;
    if (!mine && !responseInScope(access.responseScope, answers)) return false;
    return matchesExportFilter(
      { status: r.status, submittedAt: r.submittedAt },
      filter,
    );
  });

  const hasMore = visible.length > MAX_EXPORT_ROWS;
  const kept = visible.slice(0, MAX_EXPORT_ROWS);

  const responses: ExportableResponse[] = kept.map((r) => ({
    responseNumber: r.responseNumber,
    recordNo: r.recordNo,
    status: r.status,
    // 匿名フォームでは名前を持ち出さない（画面で隠したものをファイルで出さない）。
    respondent: hidden
      ? null
      : r.submittedByUser.displayName || r.submittedByUser.username,
    submittedAt: r.submittedAt,
    createdAt: r.createdAt,
    answers: (r.answers ?? {}) as Record<string, FormAnswerValue>,
  }));

  const fields = await unionFields(
    form.id,
    detail.fields,
    kept.map((r) => r.version),
    filter.fieldKeys,
  );

  return { form: detail, fields, responses, hasMore };
}

/**
 * 今の版の項目 + 対象の回答が使っている古い版にしか無い項目。
 *
 * 版ごとに項目は不変（form_versions は書き換えない）なので、出てきた版だけを
 * 読めば足りる。順序は「今の版の定義順 → 古い版で初めて見つかった順」。
 */
async function unionFields(
  formId: string,
  current: FormFieldDef[],
  versions: number[],
  fieldKeys: string[],
): Promise<FormFieldDef[]> {
  const seen = new Set(current.map((f) => f.key));
  const extra: FormFieldDef[] = [];

  const others = [...new Set(versions)].filter((v) => v > 0);
  if (others.length > 0) {
    for (const version of others.sort((a, b) => b - a)) {
      const fields = await fetchFormVersionFields(formId, version);
      for (const f of fields) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        extra.push(f);
      }
    }
  }

  return exportFields([...current, ...extra], fieldKeys);
}

/** 表 1 行ぶんの値（Excel / PDF が同じものを使う）。 */
export function answerCells(
  response: ExportableResponse,
  fields: FormFieldDef[],
): {
  field: FormFieldDef;
  label: string;
  text: string;
  number: number | null;
}[] {
  return fields.map((field) => ({
    field,
    label: fieldLabel(field),
    text: answerToCellText(field, response.answers[field.key]),
    number: numericAnswer(field, response.answers[field.key]),
  }));
}

/**
 * ダウンロードするファイル名。
 *
 * 定義の書き出し（form-transfer.ts exportFileName）と同じ考え方で、
 * OS が嫌う文字を落として長さを切る。日本語のまま出すので、
 * route handler 側は RFC 5987 の `filename*` で渡すこと。
 */
export function exportDownloadName(
  title: string,
  code: string,
  extension: string,
  locale: Locale = "ja",
): string {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const prefix = label("common.response", locale, "回答");
  const untitled = label("common.untitled", locale, "無題");
  return `${prefix}_${safe || untitled}_${code}.${extension}`;
}
