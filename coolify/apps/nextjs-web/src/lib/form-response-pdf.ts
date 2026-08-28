import "server-only";

/**
 * form-response-pdf.ts — 回答 1 件ぶんの HTML を組み立てる。
 *
 * フォームの項目は**利用者が組む**ので、他の帳票のように列を決め打ちできない。
 * lib/pdf.ts のテンプレート置換に条件分岐が無い以上、行の組み立てはサーバ側で
 * やるしかない（検査表 lib/inspection-sheet-pdf.ts と同じ手口）。
 *
 * **置換は HTML をエスケープしない。** 回答は利用者の入力そのものなので、
 * ここを通る文字列は必ず `esc()` を通すこと。1 か所抜けると帳票が壊れるか、
 * 最悪その場で HTML が効く。
 */

import { STATUS_MAPS } from "@/components/ui/StatusBadge";
import type { ApprovalTrailEntry } from "./approvals";
import { answerCells } from "./form-export";
import type { ExportableResponse } from "./form-export-core";
import type { FormFieldDef } from "./form-schema";
import type { Formatters } from "./format";

/** HTML エスケープ。検査表 PDF と同じもの（帳票側で 1 か所に寄せる）。 */
export function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const statusLabel = (status: string): string =>
  (STATUS_MAPS.FormResponse as Record<string, { label: string }>)[status]
    ?.label ?? status;

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

/** 回答 1 件 = 1 ページぶんの HTML。 */
export function responsePageHtml(input: FormResponsePageInput): string {
  const { formTitle, formCode, respondent, response, fields, trail, fmt } =
    input;

  const meta = [
    ["回答番号", response.responseNumber],
    ["No.", String(response.recordNo)],
    ["状態", statusLabel(response.status)],
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

  const answers = answerCells(response, fields)
    .map((cell) => {
      const empty = cell.text === "";
      return `<tr><th>${esc(cell.label)}</th><td${empty ? ' class="empty"' : ""}>${
        empty ? "（未回答）" : esc(cell.text)
      }</td></tr>`;
    })
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
