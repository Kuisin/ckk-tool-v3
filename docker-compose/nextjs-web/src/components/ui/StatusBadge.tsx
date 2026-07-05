/**
 * status.tsx — Status enum → Mantine Badge color/label registry.
 *
 * Single source of truth for every status badge in the app.
 * Mirrors `_specs/design.md` §9 exactly (entity / status / color / Japanese label).
 *
 * Usage:
 *   <StatusBadge entity="Quote" status="ISSUED" />
 *   <StatusBadge entity="WorkOrderApproval" status="PENDING_2ND" />
 */

import { Badge, type BadgeProps } from "@mantine/core";

export interface StatusDef {
  label: string;
  color: string;
}

type StatusMap = Record<string, StatusDef>;

/** Per-entity status → { color, label } maps. Keys match DB enum values. */
export const STATUS_MAPS = {
  Estimate: {
    DRAFT: { label: "下書き", color: "gray" },
    CONFIRMED: { label: "確定", color: "blue" },
    REGISTERED: { label: "価格表登録済", color: "green" },
  },
  Quote: {
    DRAFT: { label: "下書き", color: "gray" },
    ISSUED: { label: "発行済", color: "blue" },
    ACCEPTED: { label: "受諾済", color: "green" },
    REJECTED: { label: "却下", color: "red" },
    EXPIRED: { label: "期限切れ", color: "orange" },
  },
  OrderAcceptance: {
    PENDING: { label: "照合中", color: "yellow" },
    PRICE_DIFF: { label: "価格差異", color: "orange" },
    CONFIRMED: { label: "確定", color: "green" },
  },
  MaterialPurchaseOrder: {
    DRAFT: { label: "下書き", color: "gray" },
    REQUESTED: { label: "承認依頼中", color: "yellow" },
    APPROVED: { label: "承認済", color: "blue" },
    ORDERED: { label: "発注済", color: "violet" },
    COMPLETED: { label: "入荷完了", color: "green" },
    CANCELLED: { label: "キャンセル", color: "red" },
  },
  SalesOrder: {
    DRAFT: { label: "下書き", color: "gray" },
    CONFIRMED: { label: "確定", color: "blue" },
    IN_PRODUCTION: { label: "製造中", color: "violet" },
    PARTIAL_SHIPPED: { label: "一部出荷", color: "orange" },
    SHIPPED: { label: "出荷済", color: "green" },
    CANCELLED: { label: "キャンセル", color: "red" },
  },
  WorkOrder: {
    DRAFT: { label: "下書き", color: "gray" },
    PENDING_APPROVAL: { label: "承認待ち", color: "yellow" },
    APPROVED: { label: "承認済", color: "blue" },
    IN_PROGRESS: { label: "進行中", color: "violet" },
    COMPLETED: { label: "完了", color: "green" },
    CANCELLED: { label: "キャンセル", color: "red" },
  },
  WorkOrderApproval: {
    NONE: { label: "—", color: "gray" },
    PENDING_1ST: { label: "第一承認待ち", color: "yellow" },
    APPROVED_1ST: { label: "第一承認済", color: "blue" },
    PENDING_2ND: { label: "第二承認待ち", color: "orange" },
    APPROVED: { label: "承認済", color: "green" },
    REJECTED: { label: "差し戻し", color: "red" },
  },
  Step: {
    PENDING: { label: "未着手", color: "gray" },
    IN_PROGRESS: { label: "進行中", color: "blue" },
    COMPLETED: { label: "完了", color: "green" },
    CANCELLED: { label: "キャンセル", color: "red" },
  },
  ShippingOrder: {
    DRAFT: { label: "下書き", color: "gray" },
    CONFIRMED: { label: "確定", color: "blue" },
    SHIPPED: { label: "出荷済", color: "green" },
  },
  DeliveryNote: {
    DRAFT: { label: "下書き", color: "gray" },
    ISSUED: { label: "発行済", color: "blue" },
    DELIVERED: { label: "納品済", color: "green" },
  },
  Invoice: {
    DRAFT: { label: "下書き", color: "gray" },
    ISSUED: { label: "発行済", color: "blue" },
    SENT: { label: "送付済", color: "violet" },
    PAID: { label: "支払済", color: "green" },
  },
  InspectionRecord: {
    PENDING: { label: "未実施", color: "gray" },
    PASS: { label: "合格", color: "green" },
    FAIL: { label: "不合格", color: "red" },
    APPROVED: { label: "承認済", color: "teal" },
  },
  DesignRequest: {
    PENDING: { label: "未着手", color: "gray" },
    IN_PROGRESS: { label: "進行中", color: "blue" },
    COMPLETED: { label: "完了", color: "green" },
  },
  BillingClosing: {
    PENDING: { label: "未処理", color: "gray" },
    PROCESSED: { label: "処理済", color: "blue" },
    EXPORTED: { label: "エクスポート済", color: "green" },
  },
  ApprovalRequest: {
    PENDING: { label: "承認待ち", color: "yellow" },
    APPROVED: { label: "承認済", color: "green" },
    REJECTED: { label: "差し戻し", color: "red" },
  },
} satisfies Record<string, StatusMap>;

export type StatusEntity = keyof typeof STATUS_MAPS;

interface StatusBadgeProps extends Omit<BadgeProps, "color" | "children"> {
  entity: StatusEntity;
  status: string;
}

/** Maps an entity status enum to its themed Badge. */
export function StatusBadge({ entity, status, ...props }: StatusBadgeProps) {
  const def = (STATUS_MAPS[entity] as StatusMap)[status] ?? {
    label: status,
    color: "gray",
  };
  return (
    <Badge color={def.color} {...props}>
      {def.label}
    </Badge>
  );
}

/** Build Select options from a status map (for filter bars). */
export function statusOptions(
  entity: StatusEntity,
): { value: string; label: string }[] {
  return Object.entries(STATUS_MAPS[entity] as StatusMap)
    .filter(([, def]) => def.label !== "—")
    .map(([value, def]) => ({ value, label: def.label }));
}
