import "server-only";

/**
 * form-response-pdf.ts — 回答 1 件ぶんの HTML を組み立てる。
 *
 * フォームの項目は**利用者が組む**ので、他の帳票のように列を決め打ちできない。
 * lib/pdf.ts のテンプレート置換に条件分岐が無い以上、行の組み立てはサーバ側で
 * やるしかない（検査表 lib/inspection-sheet-pdf.ts と同じ手口）。
 *
 * **器の決め方は lib/form-answer-display.ts が画面と共有する。** 以前ここは
 * Excel 用の平坦化（answerToCellText）をそのまま刷っていたので、紙だけ別物に
 * なっていた — 複数行が 1 セルに詰まり、サブテーブルが「列=値 / 列=値」の
 * 文字列になり、選択肢が「A, B」と並んでいた。表計算に畳むのと紙に組むのは
 * 別の仕事なので、分けてある。
 *
 * **置換は HTML をエスケープしない。** 回答は利用者の入力そのものなので、
 * ここを通る文字列は必ず `esc()` を通すこと。1 か所抜けると帳票が壊れるか、
 * 最悪その場で HTML が効く。唯一の例外はリッチテキストで、
 * rich-text-core.toHtml が内部で全てのテキストと href をエスケープしている。
 */

import { statusLabel as statusMapLabel } from "@/lib/status-map";
import type { ApprovalTrailEntry } from "./approvals";
import {
  answerShape,
  attachmentCount,
  formatNumberAnswer,
  isBlankAnswer,
  selectedLabels,
  tableRows,
} from "./form-answer-display";
import type { ExportableResponse } from "./form-export-core";
import { fieldLabel } from "./form-export-core";
import type { FormAnswerValue, FormFieldDef } from "./form-schema";
import type { Formatters } from "./format";
import { formatCalendarDate, formatClockTime } from "./format";
import { type RichTextDoc, toHtml } from "./rich-text-core";

/** HTML エスケープ。検査表 PDF と同じもの（帳票側で 1 か所に寄せる）。 */
export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const EMPTY_CELL = '<span class="empty">（未回答）</span>';

export interface FormResponsePageInput {
  formTitle: string;
  formCode: string;
  /** 「回答者を表示する」フォームだけ。HIDDEN では null を渡すこと。 */
  respondent: string | null;
  response: ExportableResponse;
  fields: FormFieldDef[];
  /** 申請・報告フォームだけ。空配列なら承認欄を出さない。 */
  trail: ApprovalTrailEntry[];
  fmt: Formatters;
}

/**
 * 1 行に収まる値。**リッチテキスト・サブテーブル以外**はここを通る。
 * 返す文字列は既にエスケープ済み。
 */
function inlineValueHtml(
  field: FormFieldDef,
  value: FormAnswerValue,
  fmt: Formatters,
): string {
  // 添付は「未回答」ではない — 回答フォームに入力欄が無く、提出後に別タブで
  // 付けるものなので、空でも本人の書き忘れではない。空欄判定より前に出す。
  if (field.type === "attachment") {
    // 生の ID は絶対に刷らない（読む人には意味が無く、内部 ID の持ち出しになる）。
    const count = attachmentCount(value);
    return count > 0
      ? `${esc(String(count))} 件のファイル`
      : '<span class="empty">（添付タブで管理）</span>';
  }
  if (isBlankAnswer(field.type, value)) return EMPTY_CELL;

  switch (field.type) {
    case "number":
      return `<span class="num">${esc(formatNumberAnswer(value))}</span>`;
    case "date":
      return esc(formatCalendarDate(String(value), fmt.prefs.dateFormat));
    case "time":
      return esc(formatClockTime(String(value), fmt.prefs.timeFormat));
    case "select":
    case "multiselect": {
      const labels = selectedLabels(field, value);
      if (labels.length === 0) return EMPTY_CELL;
      // 選んだものを箇条書きにする。「A, B」だと、選択肢そのものに読点が
      // 入っていたときにいくつ選ばれたのか読めない。
      return `<ul class="choices">${labels
        .map((l) => `<li>${esc(l)}</li>`)
        .join("")}</ul>`;
    }
    case "lookup":
      return typeof value === "object" && value !== null && "label" in value
        ? esc(String((value as { label: string }).label))
        : EMPTY_CELL;
    default:
      return esc(String(value));
  }
}

/** サブテーブル 1 つを、本物の表として組む（1 セルに畳まない）。 */
function subTableHtml(
  field: FormFieldDef,
  value: FormAnswerValue,
  fmt: Formatters,
): string {
  const rows = tableRows(value);
  const columns = field.columns ?? [];
  if (rows.length === 0 || columns.length === 0) return EMPTY_CELL;

  const head = columns.map((c) => `<th>${esc(fieldLabel(c))}</th>`).join("");
  const body = rows
    .map(
      (row) =>
        `<tr>${columns
          .map((c) => `<td>${inlineValueHtml(c, row[c.key], fmt)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  // thead は改ページで繰り返される（display: table-header-group）。長い
  // サブテーブルが 2 ページに割れても、2 ページ目に列名が残る。
  return `<table class="subtable"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** 項目 1 つ = 表の 1 行。長いものは幅いっぱいの塊にする。 */
function answerRowHtml(
  field: FormFieldDef,
  value: FormAnswerValue,
  fmt: Formatters,
): string {
  const label = esc(fieldLabel(field));
  const shape = answerShape(field.type);

  if (shape === "long" || shape === "table") {
    const body =
      field.type === "richtext"
        ? isBlankAnswer(field.type, value)
          ? EMPTY_CELL
          : `<div class="rich">${toHtml(value as unknown as RichTextDoc)}</div>`
        : field.type === "table"
          ? subTableHtml(field, value, fmt)
          : isBlankAnswer(field.type, value)
            ? EMPTY_CELL
            : `<div class="pre">${esc(String(value))}</div>`;
    // ラベルを上・本文を下に積んで、紙の幅をまるごと使う。長文を 72% 幅の
    // セルに押し込むと、行数だけが増えて読みにくい。
    return `<tr class="block"><td colspan="2"><div class="block-label">${label}</div><div class="body">${body}</div></td></tr>`;
  }

  return `<tr><th>${label}</th><td>${inlineValueHtml(field, value, fmt)}</td></tr>`;
}

/** 回答 1 件 = 1 ページぶんの HTML。 */
export function responsePageHtml(input: FormResponsePageInput): string {
  const { formTitle, formCode, respondent, response, fields, trail, fmt } =
    input;

  const meta = [
    ["回答番号", response.responseNumber],
    ["No.", String(response.recordNo)],
    ["状態", statusMapLabel("FormResponse", response.status)],
    // 匿名フォームでは行ごと出さない（空欄だと「誰か居るのに空」に見える）。
    ...(respondent ? [["回答者", respondent]] : []),
    [
      "提出日時",
      response.submittedAt ? fmt.dateTime(response.submittedAt) : "—",
    ],
  ]
    .map(
      ([label, value]) =>
        `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`,
    )
    .join("");

  // related は回答の値を持たない（参照先を都度引いて見せる表示専用の項目）。
  // 紙には残せないので落とす — 空欄の行だけが並ぶと「答え忘れ」に見える。
  const answers = fields
    .filter((field) => field.type !== "related")
    .map((field) => answerRowHtml(field, response.answers[field.key], fmt))
    .join("");

  const approval = trail.length > 0 ? trailHtml(trail, fmt) : "";

  return `<div class="answer-page">
  <div class="header">
    <div class="brand">
      <img class="brand-logo" src="logo.svg" alt="シー・ケィ・ケー株式会社" />
      <div class="doc-title">${esc(formTitle)}</div>
    </div>
    <div class="issuer">
      <strong>フォーム回答</strong><br>
      フォームコード: ${esc(formCode)}
    </div>
  </div>

  <div class="meta-row">
    <div class="doc-info">
      <table>${meta}</table>
    </div>
  </div>

  <table class="answer-table">${answers}</table>
  ${approval}
</div>`;
}

/** 承認の記録（誰がいつ承認・差し戻したか）。 */
function trailHtml(trail: ApprovalTrailEntry[], fmt: Formatters): string {
  const rows = trail
    .flatMap((step) =>
      step.records.length > 0
        ? step.records.map(
            (r) =>
              `<tr><td>${step.stepNo}. ${esc(step.stepLabel)}</td><td>${esc(
                r.delegateFor
                  ? `${r.approver}（${r.delegateFor} の代理）`
                  : r.approver,
              )}</td><td>${esc(r.action === "APPROVED" ? "承認" : "差し戻し")}</td><td>${esc(
                fmt.dateTime(r.actedAt),
              )}</td><td>${esc(r.comment ?? "")}</td></tr>`,
          )
        : [
            `<tr><td>${step.stepNo}. ${esc(step.stepLabel)}</td><td colspan="4">未処理</td></tr>`,
          ],
    )
    .join("");

  return `<p class="section-label">承認の記録</p>
  <table class="trail"><tr><th>段</th><th>承認者</th><th>結果</th><th>日時</th><th>コメント</th></tr>${rows}</table>`;
}

/** ページを繋ぐ（まとめ印刷は 1 回答 = 1 ページ）。 */
export function responsePagesHtml(pages: string[]): string {
  return pages.join("\n");
}
