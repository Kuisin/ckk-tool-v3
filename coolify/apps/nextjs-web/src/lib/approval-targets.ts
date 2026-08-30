/**
 * approval-targets.ts — 承認の対象となる書類種別のレジストリ。
 *
 * 承認は多態で、対象は `targetType`（= テーブルの @@map 名）+ `targetId`
 * （業務キー）で指す。audit / audit-links と同じ規約。
 *
 * ラベル・色・詳細ページの URL はこれまで lib/approvals.ts（TARGET_LABELS）と
 * ApprovalRequestTable.tsx（TARGET_TYPE_LABEL / _COLOR / targetHref）に二重に
 * あった。増える種別ごとに 2 箇所直すのは事故のもとなのでここに 1 本化する。
 *
 * 純データ（I/O なし）— サーバーからもクライアントからも import してよい。
 */

/** 承認フローを持つ書類種別。DB 側は approval_flows の CHECK 制約が同じ集合を守る。 */
export const APPROVAL_TARGET_TYPES = [
  "order_acceptances",
  "work_orders",
  "material_purchase_orders",
  "purchase_requests",
  "work_order_flow_changes",
  "order_acceptance_cancel_requests",
  "form_responses",
  "internal_pages",
  "design_requests",
] as const;

export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

/**
 * 承認設定（MS0B）で段を組む書類種別。
 *
 * **フォームは含めない** — フォームは利用者がいくつでも作るもので、稟議・日報・
 * 点検簿が 1 本の承認を共有する理由が無い。段は `form_approval_steps` に
 * フォームごとへ持たせ、設定はフォームの「承認」タブで行う。
 * 承認エンジンから見た書類種別としては form_responses のままなので、
 * APPROVAL_TARGET_TYPES からは外さない（承認依頼中一覧・履歴はそのまま動く）。
 */
export const FLOW_SETTINGS_TARGET_TYPES: readonly ApprovalTargetType[] =
  APPROVAL_TARGET_TYPES.filter((t) => t !== "form_responses");

/**
 * 適用モード（approval_flows.apply_mode: PRE = 承認後に適用 / POST = 即時適用 +
 * 事後承認）を設定できる書類種別。列は汎用だが、対象の操作が「保留 → 適用」の
 * 形を持つものだけ UI に出す — 現状は 工程フロー変更のみ。
 */
export const APPLY_MODE_TARGETS: readonly ApprovalTargetType[] = [
  "work_order_flow_changes",
];

export interface ApprovalTargetMeta {
  /** 画面に出る書類名。 */
  label: string;
  /** バッジ色（Mantine のカラーキー）。 */
  color: string;
  /** 詳細ページ。targetId は業務キーそのまま。 */
  href: (targetId: string) => string;
  /**
   * 詳細ページの READ ゲートに使う appList のキー。
   *
   * 承認グループの所属と書類の閲覧権限は**別の軸**で、承認者だからといって
   * その書類を開けるとは限らない（例: purchasing ロールは approve:READ を
   * 持つが order_acceptance:READ は持たない）。承認管理 (PD03) はこのキーで
   * 「開けるか」を先に判定し、開けない行にバッジを出す。
   */
  appKey: string;
  /**
   * 承認 / 差し戻しを押すのに必要な権限コード。要求されるのは
   * **その書類の閲覧（READ）または編集（UPDATE）**
   * （lib/authz.ts `checkApprovalDocAccess(code)` — 各書類の approve* Server
   * Action）。承認そのものの可否は権限アクションではなく、承認設定（MS0B）の
   * 承認グループ所属だけが決める（旧 `code:APPROVE` 要件は廃止）。
   *
   * これは**追加ゲート**で、実際に押せるかは
   *   ① この権限（code:READ / code:UPDATE。code:ADMIN と system:ADMIN も内包）
   *   ② 承認グループの所属（本人 or 代理 — actOnCurrentStep）
   *   ③ 書類のスコープ（拠点 — *InScope。ALL 以外の grant は書類ごとに変わる）
   * の **すべて**を満たしたときだけ。承認設定 (MS0B) はこのコードを画面に出し、
   * 各段のメンバーが ① を持っているかを突き合わせる。
   */
  approvePermission: string;
}

export const APPROVAL_TARGET: Record<ApprovalTargetType, ApprovalTargetMeta> = {
  order_acceptances: {
    label: "注文請書",
    color: "blue",
    href: (id) => `/sales/order-acceptances/${id}`,
    appKey: "order-acceptances",
    approvePermission: "order_acceptance",
  },
  work_orders: {
    label: "指示書",
    color: "violet",
    href: (id) => `/production/work-orders/${id}`,
    appKey: "work-orders",
    approvePermission: "work_order",
  },
  material_purchase_orders: {
    label: "素材発注書",
    color: "teal",
    href: (id) => `/purchase/purchase-orders/${id}`,
    appKey: "purchase-orders",
    approvePermission: "purchase_order",
  },
  work_order_flow_changes: {
    label: "工程フロー変更",
    color: "grape",
    // 対象は変更そのもの（uuid）だが、人が見たいのは指示書 — 保留中の変更は
    // 指示書詳細にカードで出る。この URL は指示書番号へ読み替えて 302 する
    // だけの中継ページ（承認管理の行から 1 クリックで着ける）。
    href: (id) => `/production/work-orders/flow-changes/${id}`,
    appKey: "work-orders",
    approvePermission: "work_order",
  },
  order_acceptance_cancel_requests: {
    label: "注文請書キャンセル",
    color: "red",
    // 対象は依頼そのもの（uuid）だが、人が見たいのは注文請書 — 保留中の依頼は
    // 注文請書詳細にカードで出る。番号へ読み替えて 302 する中継ページ。
    href: (id) => `/sales/order-acceptances/cancel-requests/${id}`,
    appKey: "order-acceptances",
    approvePermission: "order_acceptance",
  },
  form_responses: {
    label: "フォーム申請",
    color: "indigo",
    // 回答は「どのフォームの何番目か」で辿るのが自然だが、承認一覧からは
    // 業務キー（FRM-…）1 本しか渡ってこない。番号から所属フォームを引いて
    // 実ページへ 302 する中継ページを置く。
    href: (id) => `/general/forms/responses/${id}`,
    appKey: "forms",
    approvePermission: "form",
  },
  internal_pages: {
    label: "社内文書",
    color: "lime",
    href: (id) => `/general/documents/${id}`,
    appKey: "internal-pages",
    approvePermission: "internal_page",
  },
  purchase_requests: {
    label: "購買依頼",
    color: "cyan",
    href: (id) => `/purchase/purchase-requests/${id}`,
    appKey: "purchase-requests",
    // 購買依頼は素材発注と同じ権限コード（購買一式で 1 コード）。
    approvePermission: "purchase_order",
  },
  design_requests: {
    label: "設計依頼書",
    color: "orange",
    href: (id) => `/sales/design-requests/${id}`,
    appKey: "design-requests",
    approvePermission: "design_request",
  },
};

export function isApprovalTargetType(v: string): v is ApprovalTargetType {
  return (APPROVAL_TARGET_TYPES as readonly string[]).includes(v);
}

/** 書類名（未知の種別はキーをそのまま出す — 画面が空白になるより読める）。 */
export function approvalTargetLabel(targetType: string): string {
  return isApprovalTargetType(targetType)
    ? APPROVAL_TARGET[targetType].label
    : targetType;
}

/** 詳細ページの URL（未知の種別は null）。 */
export function approvalTargetHref(
  targetType: string,
  targetId: string,
): string | null {
  return isApprovalTargetType(targetType)
    ? APPROVAL_TARGET[targetType].href(targetId)
    : null;
}

/** 承認に必要な権限コード（未知の種別は null）。 */
export function approvePermissionCode(targetType: string): string | null {
  return isApprovalTargetType(targetType)
    ? APPROVAL_TARGET[targetType].approvePermission
    : null;
}
