"use client";

/**
 * 打ち切った指示書の印（work_orders.aborted_at）。
 *
 * 打ち切りの status は CANCELLED のままなので、状態バッジだけでは普通の
 * キャンセルと見分けが付かない。詳細 (PD22) と一覧 (PD02) が同じ 1 つを使い、
 * 色と文言を画面ごとに変えない。
 */

import { Badge, type BadgeProps } from "@mantine/core";
import { useTranslations } from "next-intl";

export function WorkOrderAbortedBadge(
  props: Omit<BadgeProps, "color" | "children" | "variant">,
) {
  const tr = useTranslations();
  return (
    <Badge color="red" size="sm" variant="light" {...props}>
      {tr("production.workOrderAbort.abortedBadge")}
    </Badge>
  );
}
