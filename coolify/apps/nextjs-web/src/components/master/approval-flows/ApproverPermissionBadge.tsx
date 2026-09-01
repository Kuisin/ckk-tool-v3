"use client";

/**
 * ApproverPermissionBadge — 承認の段にいるメンバーが、その書類を閲覧・編集
 * できる権限（`<code>:READ / UPDATE` — 承認の RBAC 要件）を持っているかを
 * 1 つのバッジで表す。
 *
 * 誰が承認するかは承認グループだけで決まるが、書類を開けない人は押しても
 * 弾かれる（権限・所属・スコープの 3 つが揃って初めて押せる —
 * lib/approval-permissions.ts）。設定側で気づけるよう、承認設定の一覧
 * （ApprovalFlowOverview）とフロー編集（ApprovalFlowEditor）が同じバッジを使う。
 */

import { Badge, Tooltip } from "@mantine/core";
import { useLocale, useTranslations } from "next-intl";
import { permissionScopeLabel } from "@/lib/enum-labels";

/** 段の承認グループに今いる 1 人 + 承認権限の有無。 */
export interface FlowApprover {
  userId: string;
  displayName: string;
  /** 書類の READ / UPDATE を持つか。false = 承認ボタンを押しても弾かれる。 */
  allowed: boolean;
  /** 全社スコープか。false = 拠点等に限定され、書類によっては押せない。 */
  unrestricted: boolean;
  /** 限定スコープの内訳（PLANT / OWN …）。 */
  scopes: string[];
}

/** 段のメンバーを権限で仕分ける（バッジの色と文言はこれだけで決まる）。 */
export function summarizeApprovers(approvers: readonly FlowApprover[]) {
  return {
    missing: approvers.filter((a) => !a.allowed),
    limited: approvers.filter((a) => a.allowed && !a.unrestricted),
  };
}

/** 段に「押せない人」がいる（= 承認が止まりうる）か。 */
export function hasApproverGap(approvers: readonly FlowApprover[]): boolean {
  return (
    approvers.length === 0 || summarizeApprovers(approvers).missing.length > 0
  );
}

export function ApproverPermissionBadge({
  approvers,
}: {
  approvers: readonly FlowApprover[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  if (approvers.length === 0) {
    return (
      <Tooltip
        label={tr("master.approvalFlows.nobodyCanApproveThisStepRight")}
        withinPortal
      >
        <Badge color="red" size="sm" variant="light">
          {tr("master.approvalFlows.noMembers")}
        </Badge>
      </Tooltip>
    );
  }
  const { missing, limited } = summarizeApprovers(approvers);
  if (missing.length > 0) {
    return (
      <Tooltip
        label={tr("master.approvalFlows.noDocumentPermission", {
          names: missing.map((a) => a.displayName).join(tr("common.s3")),
        })}
        withinPortal
      >
        <Badge color="red" size="sm" variant="light">
          {tr("master.approvalFlows.noPermissionCount", {
            total: approvers.length,
            count: missing.length,
          })}
        </Badge>
      </Tooltip>
    );
  }
  if (limited.length > 0) {
    return (
      <Tooltip
        label={tr("master.approvalFlows.scopeIsLimited", {
          names: limited
            .map((a) =>
              tr("master.approvalFlows.approverScopeItem", {
                name: a.displayName,
                scopes: a.scopes
                  .map((s) => permissionScopeLabel(s, locale))
                  .join(tr("common.s1")),
              }),
            )
            .join(tr("common.s3")),
        })}
        withinPortal
      >
        <Badge color="yellow" size="sm" variant="light">
          {tr("master.approvalFlows.canApproveScopeLimited", {
            total: approvers.length,
            count: limited.length,
          })}
        </Badge>
      </Tooltip>
    );
  }
  return (
    <Badge color="green" size="sm" variant="light">
      {tr("master.approvalFlows.canApproveCount", {
        total: approvers.length,
      })}
    </Badge>
  );
}
