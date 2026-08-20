"use client";

/**
 * StepApproverBadge — その段を「今この瞬間に承認できる人が何名いるか」。
 *
 * 承認できるかどうかは **承認グループの所属だけ** で決まる（RBAC の権限は
 * 関係しない）。だからこの数字がそのまま「押せる人の数」になる。0 名なら
 * 承認依頼を出しても止まるので、赤で出して設定側で気づけるようにする。
 *
 * 承認設定の一覧（ApprovalFlowOverview）とフロー編集（ApprovalFlowEditor）が
 * 同じバッジを使う。
 */

import { Badge, Tooltip } from "@mantine/core";

/** 段の承認グループに今いる 1 人。 */
export interface StepApprover {
  userId: string;
  displayName: string;
}

export function StepApproverBadge({
  approvers,
}: {
  approvers: readonly StepApprover[];
}) {
  if (approvers.length === 0) {
    return (
      <Tooltip
        label="この段を承認できる人が今いません。承認依頼を出しても止まります。"
        withinPortal
      >
        <Badge color="red" size="sm" variant="light">
          メンバー0名
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Tooltip
      label={`承認できる人: ${approvers.map((a) => a.displayName).join("、")}`}
      withinPortal
    >
      <Badge color="green" size="sm" variant="light">
        {approvers.length}名 承認可
      </Badge>
    </Tooltip>
  );
}
