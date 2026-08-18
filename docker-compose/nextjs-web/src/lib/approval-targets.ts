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
] as const;

export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

export interface ApprovalTargetMeta {
  /** 画面に出る書類名。 */
  label: string;
  /** バッジ色（Mantine のカラーキー）。 */
  color: string;
  /** 詳細ページ。targetId は業務キーそのまま。 */
  href: (targetId: string) => string;
}

export const APPROVAL_TARGET: Record<ApprovalTargetType, ApprovalTargetMeta> = {
  order_acceptances: {
    label: "注文請書",
    color: "blue",
    href: (id) => `/sales/order-acceptances/${id}`,
  },
  work_orders: {
    label: "指示書",
    color: "violet",
    href: (id) => `/production/work-orders/${id}`,
  },
  material_purchase_orders: {
    label: "素材発注書",
    color: "teal",
    href: (id) => `/purchase/purchase-orders/${id}`,
  },
  purchase_requests: {
    label: "購買依頼",
    color: "cyan",
    href: (id) => `/purchase/purchase-requests/${id}`,
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
