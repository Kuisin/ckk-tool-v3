"use client";

/**
 * ApprovalFlowOverview — 書類種別ごとの承認フローの一覧（承認設定 MS0B）。
 *
 * 1 書類 = 1 枚のカード。段を「1 第一承認 · 工場長 · いずれか1名」の形で並べ、
 * 編集は種別ごとの編集ページへ。未設定の書類は赤いカードで出す — 未設定のまま
 * だと承認依頼そのものが出せないため、放置に気づける必要がある。
 *
 * 各カードには「承認に必要な権限」（<code>:READ / UPDATE — 書類を閲覧・
 * 編集できること）を出し、段ごとに承認グループのメンバーがそれを持って
 * いるかを突き合わせて出す。誰が承認するかは承認グループだけで決まるが、
 * 書類を開けない人は押しても弾かれるので、設定画面で先に気づけるようにする。
 *
 * モバイルでは編集ボタンを次の行へ落として全幅にする（design.md §20.2）。
 * 横に並べたままだと段の列が数十 px まで潰れて読めなくなるため。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconShieldCheck,
} from "@tabler/icons-react";
import { EditButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_TARGET,
  type ApprovalTargetType,
} from "@/lib/approval-targets";
import { APPROVAL_MODE_LABEL } from "@/lib/enum-labels";
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
  /** 承認に必要な権限コード（書類の READ / UPDATE を突き合わせる）。 */
  permissionCode: string;
  /** 権限コードの表示名（app.permissions.display_name）。 */
  permissionLabel: string;
  /** 有効な条件付きフローの本数（0 = バッジなし）。 */
  ruleCount: number;
  steps: FlowOverviewStep[];
}

export function ApprovalFlowOverview({ rows }: { rows: FlowOverviewRow[] }) {
  const isMobile = useIsMobile();
  return (
    <Stack gap="sm">
      <Text c="dimmed" size="sm">
        書類ごとに、確定の前に通す承認の段を並べます。変更は今後の承認依頼から
        適用され、進行中の書類は依頼した時点の設定のまま進みます。
      </Text>
      <Text c="dimmed" size="sm">
        誰が承認できるかは承認グループだけで決まります。加えて、承認を押すには
        その書類を閲覧または編集できる権限が要ります。段のバッジは、今その段に
        いるメンバーが書類を開けるかを表します。
      </Text>
      {rows.map((r) => {
        const meta = APPROVAL_TARGET[r.targetType];
        const empty = r.steps.length === 0;
        // 段のどれかに「押せない人」がいれば、カードごと目立たせる
        // （段のバッジは横に流れるので、一覧では見落とすため）。
        const blocked =
          empty || r.steps.some((s) => hasApproverGap(s.approvers));
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
                      条件付き {r.ruleCount} 本
                    </Badge>
                  )}
                  {empty && (
                    <Group c="red" gap={4} wrap="nowrap">
                      <IconAlertTriangle size={14} />
                      <Text size="xs">
                        未設定 — この書類は承認依頼を出せません
                      </Text>
                    </Group>
                  )}
                </Group>
                <Group c="dimmed" gap={6} wrap="nowrap">
                  <IconShieldCheck size={14} />
                  <Text size="xs">
                    承認に必要な権限: {r.permissionLabel} の閲覧または編集
                  </Text>
                  <Text ff="mono" size="xs">
                    {r.permissionCode}:READ / UPDATE
                  </Text>
                </Group>
                {!empty && (
                  <Group gap="xs" wrap="wrap">
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
                          {APPROVAL_MODE_LABEL[s.mode] ?? s.mode}
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
                {empty ? "設定" : "編集"}
              </EditButton>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
