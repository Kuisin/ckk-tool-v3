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
 * ここは pure / client-safe のみ。
 */

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
export const DESIGN_HISTORY_ACTION_LABEL: Record<string, string> = {
  CREATE: "作成",
  UPDATE: "更新",
  REQUEST_APPROVAL: "承認依頼",
  APPROVE: "承認",
  REJECT: "差し戻し",
  ASSIGN: "担当者変更",
  KIND_OVERRIDE: "依頼区分の変更",
  START: "着手",
  COMPLETE: "完了",
  REOPEN: "差し戻し（作業）",
  CANCEL: "キャンセル",
};

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

/** 判定の根拠を 1 行の日本語にする（フォームと詳細で同じ文言を使う）。 */
export function describeDetection(d: DesignKindDetection): string {
  return d.versionCount === 0
    ? "この製品にはまだ設計書がありません → 新規"
    : `この製品には v${d.versionCount} まであります → 改訂`;
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
 * 製品マスタに出す「その製品の設計図」1 行。
 *
 * 製品の最新図面は `design_files.product_id` + `is_latest` が正で、
 * `products` 側に列は無い。差し替えは設計依頼 (SA06) の完了経由だけ
 * — 版採番と両側の is_latest クリアは completeDesign の 1 tx が唯一の
 * 管理者なので、マスタ側に第 2 の書き込み口を作らない。
 */
export interface ProductDesignFile {
  id: string;
  version: number;
  isLatest: boolean;
  filename: string;
  /** 生成元の設計依頼（DSG-…）。手動登録の版は null。 */
  requestNumber: string | null;
  notes: string | null;
  createdAt: string;
}

/** ファイルタブの1行（design_files + files の抜粋）。 */
export interface DesignRequestFile {
  id: string;
  version: number;
  isLatest: boolean;
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

/** 完了できるか（別途、設計ファイルの添付が 1 件以上必要 — サーバー側で検証）。 */
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
 * 設計ファイルを添付・削除できるか。承認前と完了後は不可。
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
