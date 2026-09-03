/**
 * model.ts — 設計依頼書 (SA06) view-model types + pure helpers.
 *
 * Model (app.design_requests — uuid PK):
 *   依頼番号 DSG-YYYYMM-NNNNN は nextDocumentNumber("DESIGN") で採番し
 *   request_number に保存する（URL id も依頼番号）。
 *   トリガ: 見積時（QUOTE — 見積書 複合キー参照）/ 受注時（SALES_ORDER —
 *   注文明細 uuid 参照）。トリガと参照元は作成後変更不可。
 *
 * 状態は 2 つの軸が重なっている:
 *   承認軸  DRAFT → REQUESTED →（承認）→ PENDING /（差し戻し）→ REJECTED
 *   作業軸  PENDING →（着手）→ IN_PROGRESS →（完了）→ COMPLETED
 * PENDING は承認フロー導入前からある値で、「未着手」= 承認済・着手待ち。
 * COMPLETED → IN_PROGRESS の「差し戻し」は**作業の巻き戻し**であって承認軸では
 * ないので、REJECTED には落とさない（承認記録にも触らない）。
 *
 * 依頼区分（新規 / 改訂）は「その製品に過去の設計書があるか」で自動判定した
 * 値を**保存**したもの。導出しないのは、区分が承認ルートを決めるから
 * （lib 側 detectDesignKind と design.prisma のコメントを参照）。
 *
 * **図面そのもの（design_files）の型はここに無い** — 設計図 (PD06) が持つ
 * （`components/production/design-files/model.ts`）。依頼は「作ってほしい」と
 * いう起票で、図面はその成果物。依頼を経ずに取り込んだ版もあるので、図面の型が
 * 依頼の型に従属していると表現できない。
 *
 * ここは pure / client-safe のみ。
 */

import type { DesignFileRole } from "@/components/production/design-files/model";

export type { DesignFileRole };

export type DesignRequestStatus =
  | "DRAFT"
  | "REQUESTED"
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type DesignRequestTrigger = "QUOTE" | "SALES_ORDER" | "STANDALONE";
export type DesignRequestKind = "NEW" | "REVISION";
export type DesignRequestPriority = "NORMAL" | "HIGH";

/**
 * トリガーバッジの色
 * （QUOTE=blue 見積時 / SALES_ORDER=violet 受注時 / STANDALONE=gray 単独）。
 * 単独を無彩色にしているのは、紐づく書類が無いこと自体が「情報が少ない」状態で、
 * 見積・受注と同じ強さで目に入る必要がないため。
 */
export const DESIGN_TRIGGER_COLOR: Record<DesignRequestTrigger, string> = {
  QUOTE: "blue",
  SALES_ORDER: "violet",
  STANDALONE: "gray",
};

/** そのトリガーが参照元の書類を持つか（単独は持たない）。 */
export function hasSourceDocument(trigger: DesignRequestTrigger): boolean {
  return trigger !== "STANDALONE";
}

/** 依頼区分バッジの色（新規=teal / 改訂=orange）。 */
export const DESIGN_KIND_COLOR: Record<DesignRequestKind, string> = {
  NEW: "teal",
  REVISION: "orange",
};

/** history Json の action → 画面表示名（PurchaseRequest と同型）。 */
// history Json の action → 表示ラベルは lib/enum-labels.ts
// designHistoryActionLabel(value, locale) が持つ（enum.DESIGN_HISTORY_ACTION_
// LABEL.*）。

/**
 * 依頼区分の自動判定結果。判定そのものはサーバー側（design_files を引く）で、
 * ここは画面に根拠を出すための形。
 */
export interface DesignKindDetection {
  kind: DesignRequestKind;
  /** その製品の既存版数（0 なら新規）。 */
  versionCount: number;
  /** 最新版の id / 表示名（改訂の元図面の既定値）。 */
  latestFileId: string | null;
  latestFileLabel: string | null;
}

/**
 * 判定の根拠を 1 行にする（フォームと詳細で同じ文言を使う）。
 * 訳は呼び出し側の `tr` に委ねる（このファイルは pure / client-safe のみ）。
 */
export function describeDetection(
  d: DesignKindDetection,
  tr: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  return d.versionCount === 0
    ? tr("sales.designRequests.noDesignYetSoNew")
    : tr("sales.designRequests.hasVersionsSoRevision", {
        versionCount: d.versionCount,
      });
}

/**
 * 逆リンク用の最小の 1 行。見積書・注文明細・製品マスタの「関連」から
 * 「この書類に紐づく設計依頼」を出すためだけの形。
 */
export interface DesignRequestLink {
  requestNumber: string;
  status: DesignRequestStatus;
  /** 依頼内容の先頭（一覧で何の依頼か分かる程度）。 */
  description: string | null;
  assigneeName: string | null;
  updatedAt: string;
}

/**
 * ファイルタブの1行。設計図 (PD06) が所有する型を借りるだけ — 依頼側で
 * 役割を定義し直すと、同じ enum が 2 箇所にできて必ずずれる。
 */
export interface DesignRequestFile {
  id: string;
  version: number;
  isLatest: boolean;
  role: DesignFileRole;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
}

/** 状態遷移履歴の1行（history Json。user は表示名へ解決済み）。 */
export interface DesignRequestHistoryView {
  action: string;
  user: string | null;
  at: string;
  notes?: string;
}

export interface DesignRequest {
  /** URL id = 依頼番号 DSG-YYYYMM-NNNNN（request_number に保存済み）。 */
  id: string;
  requestNumber: string;
  /** DB uuid — 内部参照用。 */
  uuid: string;
  trigger: DesignRequestTrigger;
  /** 見積時: 見積元の見積書番号 QOT-…（導出）。受注時・未設定は null。 */
  quoteNumber: string | null;
  /** 受注時: 参照する注文明細の uuid / 導出番号 ORD-…-NN。 */
  orderLineId: string | null;
  orderLineNumber: string | null;
  /** 製品の内部 id（連番）を文字列で保持 — SearchSelect の値と揃える。 */
  productId: string | null;
  productName: string | null;
  /** 依頼内容。 */
  description: string | null;
  /** 依頼区分 — 過去の設計書の有無から自動判定した値（上書き可）。 */
  kind: DesignRequestKind;
  /** 自動判定を人が上書きしたか（画面の「自動判定」/「手動指定」表示用）。 */
  kindOverridden: boolean;
  /** 改訂の元図面（新規は null）。 */
  baseDesignFileId: string | null;
  baseDesignFileLabel: string | null;
  /** 改訂の変更理由（改訂のとき必須）。 */
  changeReason: string | null;
  /** 希望納期（YYYY-MM-DD）。 */
  desiredAt: string | null;
  priority: DesignRequestPriority;
  status: DesignRequestStatus;
  /** 図面をつくる製造担当（承認完了で通知される相手）。 */
  assigneeId: string | null;
  assigneeName: string | null;
  /** 作成者の表示名（システム作成は null）。 */
  createdByName: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  history: DesignRequestHistoryView[];
  /** 完成した版が載る系列。null = 汎用。 */
  customerBpId: string | null;
  customerName: string | null;
  files: DesignRequestFile[];
  createdAt: string;
  updatedAt: string;
}

type StatusOnly = Pick<DesignRequest, "status">;

/**
 * フォーム全体（トリガー・参照元・担当者・依頼内容）を編集できるか。
 * 承認に出す前だけ — 承認済みの内容が後から書き換わると承認の意味が無くなる。
 */
export function isEditable(r: StatusOnly) {
  return r.status === "DRAFT" || r.status === "REJECTED";
}

/** 承認依頼を出せるか。 */
export function canRequestApproval(r: StatusOnly) {
  return isEditable(r);
}

/**
 * 承認後でも担当者を付け替えてよいか。
 *
 * 承認の対象は「何を設計するか」であって「誰がつくるか」ではないので、
 * 手が空いている人へ振り替えるのは承認をやり直す話ではない。
 */
export function canReassign(r: StatusOnly) {
  return r.status === "PENDING" || r.status === "IN_PROGRESS";
}

/** 着手できるか（承認済・着手待ち）。 */
export function canStart(r: StatusOnly) {
  return r.status === "PENDING";
}

/**
 * 完了できるか（状態だけの判定）。
 *
 * **これだけでは完了できない** — この依頼を成果物とする版
 * (design_files.design_request_id) が 1 件以上必要で、それはサーバー側
 * (completeDesign) が検証する。版の登録は 設計図 (PD06) の仕事なので、
 * 画面はここが true でも成果物が無ければ登録画面へ誘導する。
 */
export function canComplete(r: StatusOnly) {
  return r.status === "IN_PROGRESS";
}

/** 作業を巻き戻せるか（完了 → 進行中）。 */
export function canReopen(r: StatusOnly) {
  return r.status === "COMPLETED";
}

/** キャンセルできるか — 完了済み・キャンセル済み以外。 */
export function isCancellable(r: StatusOnly) {
  return r.status !== "COMPLETED" && r.status !== "CANCELLED";
}

/**
 * **作業ファイル**（document_attachments — メモ・下書き）を添付・削除できるか。
 * 承認前と完了後は不可。成果物の版は 設計図 (PD06) が持つので、これとは別。
 * （旧実装は「完了以外は可」だったが、それだと下書き・キャンセル済みにも
 * 入れられてしまう。サーバー側 /api/attachments でも同じ条件で弾く。）
 *
 * いまは canReassign と同じ状態集合だが**意味が違うので別の述語にする** —
 * 片方の条件を変えたときに、もう片方が黙って一緒に動くのを避ける。
 */
export function canAttachFiles(r: StatusOnly) {
  return r.status === "PENDING" || r.status === "IN_PROGRESS";
}

/** 依頼区分を手で上書きできるか（承認に出す前だけ）。 */
export function canOverrideKind(r: StatusOnly) {
  return isEditable(r);
}

/**
 * 帳票 (PDF) を出してよい状態 = 承認済み以降。
 *
 * lib/document-pdf.ts の isIssued（`!== "DRAFT"`）は使えない —
 * REQUESTED / REJECTED / CANCELLED まで通ってしまう。
 */
export function isIssuedDesign(status: DesignRequestStatus) {
  return (
    status === "PENDING" || status === "IN_PROGRESS" || status === "COMPLETED"
  );
}
