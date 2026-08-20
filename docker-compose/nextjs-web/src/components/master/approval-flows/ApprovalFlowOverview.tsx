"use client";

/**
 * ApprovalFlowOverview — 書類種別ごとの承認フローの一覧（承認設定 MS0B）。
 *
 * 1 書類 = 1 枚のカード。段を「1 第一承認 · 工場長 · いずれか1名」の形で並べ、
 * 編集は種別ごとの編集ページへ。未設定の書類は赤いカードで出す — 未設定のまま
 * だと承認依頼そのものが出せないため、放置に気づける必要がある。
 *
 * 段ごとに「今その段を承認できる人が何名いるか」も出す。承認できるかどうかは
 * **承認グループの所属だけ** で決まる（RBAC の権限は関係しない）ので、この
 * 数字がそのまま押せる人の数になる。0 名の段があるカードも赤で出す — 依頼を
 * 出しても止まるため。
 *
 * モバイルでは編集ボタンを次の行へ落として全幅にする（design.md §20.2）。
 * 横に並べたままだと段の列が数十 px まで潰れて読めなくなるため。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconAlertTriangle, IconArrowRight } from "@tabler/icons-react";
import { EditButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import {
  APPROVAL_TARGET,
  type ApprovalTargetType,
} from "@/lib/approval-targets";
import { APPROVAL_MODE_LABEL } from "@/lib/enum-labels";
import { type StepApprover, StepApproverBadge } from "./StepApproverBadge";

const BASE_PATH = "/master/approval-settings";

export type { StepApprover };

export interface FlowOverviewStep {
  stepNo: number;
  label: string;
  groupLabel: string;
  mode: "ANY" | "ALL";
  /** 今この瞬間に承認できるメンバー（期間外・無効は除く）。 */
  approvers: StepApprover[];
}

export interface FlowOverviewRow {
  targetType: ApprovalTargetType;
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
        承認できるのは、その段の承認グループに入っている人（と期間内の代理）
        だけです。段のバッジは、今その段を承認できる人の数を表します。
      </Text>
      {rows.map((r) => {
        const meta = APPROVAL_TARGET[r.targetType];
        const empty = r.steps.length === 0;
        // 承認できる人が 1 人もいない段があるカードも、未設定と同じ赤で出す
        // （段のバッジは横に流れるので、一覧では見落とすため）。
        const blocked = empty || r.steps.some((s) => s.approvers.length === 0);
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
                  {empty && (
                    <Group c="red" gap={4} wrap="nowrap">
                      <IconAlertTriangle size={14} />
                      <Text size="xs">
                        未設定 — この書類は承認依頼を出せません
                      </Text>
                    </Group>
                  )}
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
                        <StepApproverBadge approvers={s.approvers} />
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
