"use client";

/**
 * ApprovalFlowOverview — 書類種別ごとの承認フローの一覧（承認設定 MS0B）。
 *
 * 1 書類 = 1 枚のカード。段を「1 第一承認 · 工場長 · いずれか1名」の形で並べ、
 * 編集は種別ごとの編集ページへ。
 *
 * 各カードに「承認を使う」スイッチ（lib/approval-policy-core.ts）。OFF の種別は
 * 段が残っていても承認なしで進む（段はグレーで残す）。ON で段が 1 つも無い種別は
 * **依頼できない**ので赤いカードで出す — 放置に気づける必要がある。
 *
 * 各カードには「承認に必要な権限」（<code>:READ / UPDATE — 書類を閲覧・
 * 編集できること）を出し、段ごとに承認グループのメンバーがそれを持って
 * いるかを突き合わせて出す。誰が承認するかは承認グループだけで決まるが、
 * 書類を開けない人は押しても弾かれるので、設定画面で先に気づけるようにする。
 *
 * モバイルでは編集ボタンを次の行へ落として全幅にする（design.md §20.2）。
 * 横に並べたままだと段の列が数十 px まで潰れて読めなくなるため。
 */

import { Badge, Group, Paper, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setApprovalPolicy } from "@/app/(dashboard)/master/approval-settings/actions";
import { EditButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import type { ApprovalNeed } from "@/lib/approval-policy-core";
import {
  APPROVAL_TARGET,
  type ApprovalTargetType,
} from "@/lib/approval-targets";
import { approvalModeLabel } from "@/lib/enum-labels";
import {
  ApproverPermissionBadge,
  type FlowApprover,
  hasApproverGap,
} from "./ApproverPermissionBadge";

const BASE_PATH = "/master/approval-settings";

export type { FlowApprover };

export interface FlowOverviewStep {
  stepNo: number;
  label: string;
  groupLabel: string;
  mode: "ANY" | "ALL";
  /** 今この瞬間に承認できるメンバー（期間外・無効は除く）。 */
  approvers: FlowApprover[];
}

export interface FlowOverviewRow {
  targetType: ApprovalTargetType;
  /** いま依頼を出したらどうなるか: 承認を通す / 承認なし / 依頼できない。 */
  need: ApprovalNeed;
  /** スイッチが保存済みか（false = 未設定で従来の挙動）。 */
  policySet: boolean;
  /** 承認に必要な権限コード（書類の READ / UPDATE を突き合わせる）。 */
  permissionCode: string;
  /** 権限コードの表示名（app.permissions.display_name）。 */
  permissionLabel: string;
  /** 有効な条件付きフローの本数（0 = バッジなし）。 */
  ruleCount: number;
  steps: FlowOverviewStep[];
}

export function ApprovalFlowOverview({
  rows,
  canEditPolicy,
}: {
  rows: FlowOverviewRow[];
  canEditPolicy: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const togglePolicy = (targetType: ApprovalTargetType, on: boolean) =>
    startTransition(async () => {
      const r = await setApprovalPolicy(targetType, on ? "on" : "off");
      if (!r.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: r.error,
          color: "red",
        });
        return;
      }
      router.refresh();
    });
  return (
    <Stack gap="sm">
      <Text c="dimmed" size="sm">
        {tr("master.approvalFlows.listsTheApprovalStepsADocument")}
      </Text>
      <Text c="dimmed" size="sm">
        {tr("master.approvalFlows.whoCanApproveIsDecidedBy")}
      </Text>
      {rows.map((r) => {
        const meta = APPROVAL_TARGET[r.targetType];
        const empty = r.steps.length === 0;
        const off = r.need === "skip";
        // 依頼できない（ON で段なし）か、段のどれかに「押せない人」がいれば
        // カードごと目立たせる（段のバッジは横に流れるので、一覧では見落とすため）。
        // OFF の種別は段を使わないので、押せない人がいても赤くしない。
        const blocked =
          r.need === "blocked" ||
          (!off && r.steps.some((s) => hasApproverGap(s.approvers)));
        return (
          <Paper
            key={r.targetType}
            p="md"
            radius="md"
            style={
              blocked
                ? { borderLeft: "4px solid var(--mantine-color-red-filled)" }
                : undefined
            }
            withBorder
          >
            <Group
              align="flex-start"
              justify="space-between"
              wrap={isMobile ? "wrap" : "nowrap"}
            >
              <Stack className="min-w-0 flex-1" gap="xs">
                <Group gap="xs">
                  <Badge color={meta.color} size="sm" variant="light">
                    {meta.label}
                  </Badge>
                  {r.ruleCount > 0 && (
                    <Badge color="indigo" size="xs" variant="light">
                      {tr("master.approvalFlows.ruleCountBadge", {
                        count: r.ruleCount,
                      })}
                    </Badge>
                  )}
                  {r.need === "blocked" && (
                    <Group c="red" gap={4} wrap="nowrap">
                      <IconAlertTriangle size={14} />
                      <Text size="xs">
                        {tr("master.approvalFlows.notSetThisDocumentCannotBe")}
                      </Text>
                    </Group>
                  )}
                  {off && (
                    <Badge color="gray" size="sm" variant="filled">
                      {tr("master.approvalFlows.policy.offBadge")}
                    </Badge>
                  )}
                </Group>
                <Group c="dimmed" gap={6} wrap="nowrap">
                  <IconShieldCheck size={14} />
                  <Text size="xs">
                    {tr("master.approvalFlows.requiredPermissionLine", {
                      permission: r.permissionLabel,
                    })}
                  </Text>
                  <Text ff="mono" size="xs">
                    {r.permissionCode}:READ / UPDATE
                  </Text>
                </Group>
                <Switch
                  checked={!off}
                  description={
                    off
                      ? tr("master.approvalFlows.policy.offHelp")
                      : empty
                        ? tr("master.approvalFlows.policy.onEmptyHelp")
                        : tr("master.approvalFlows.policy.onHelp")
                  }
                  disabled={!canEditPolicy || pending}
                  label={tr("master.approvalFlows.policy.label")}
                  onChange={(e) =>
                    togglePolicy(r.targetType, e.currentTarget.checked)
                  }
                  size="sm"
                />
                {!r.policySet && (
                  <Text c="dimmed" size="xs">
                    {tr("master.approvalFlows.policy.notSetYet")}
                  </Text>
                )}
                {!empty && (
                  <Group
                    gap="xs"
                    style={off ? { opacity: 0.45 } : undefined}
                    wrap="wrap"
                  >
                    {r.steps.map((s, i) => (
                      <Group gap="xs" key={s.stepNo} wrap="nowrap">
                        {i > 0 && (
                          <IconArrowRight
                            color="var(--mantine-color-dimmed)"
                            size={14}
                          />
                        )}
                        <Badge color="gray" size="sm" variant="outline">
                          {s.stepNo}
                        </Badge>
                        <Text fw={500} size="sm">
                          {s.label}
                        </Text>
                        <Text c="dimmed" size="xs">
                          {s.groupLabel} ·{" "}
                          {approvalModeLabel(s.mode, locale) ?? s.mode}
                        </Text>
                        <ApproverPermissionBadge approvers={s.approvers} />
                      </Group>
                    ))}
                  </Group>
                )}
              </Stack>
              <EditButton
                fullWidth={isMobile}
                href={`${BASE_PATH}/flows/${r.targetType}`}
              >
                {empty
                  ? tr("master.approvalFlows.setUp")
                  : tr("common.edit2")}
              </EditButton>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
