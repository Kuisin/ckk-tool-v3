"use client";

/**
 * StepListPane — 工程スプリットビューの左ペイン（工程一覧）。
 *
 * /production/work-orders/[id]/steps 配下で MasterDetailShell の master として
 * 表示する。行を選ぶと右ペイン（デスクトップ）/ 工程実行ページ（モバイル）へ。
 * 状態アイコンは StepCard と同じ対応（design.md §12.2）。
 */

import { Badge, Group, Text, ThemeIcon } from "@mantine/core";
import { IconCheck, IconClock, IconLoader, IconX } from "@tabler/icons-react";
import type { StepNavItem } from "@/app/(dashboard)/production/work-orders/data";
import { MasterListNav } from "@/components/ui/MasterListNav";

const STATUS_ICON: Record<string, { color: string; icon: typeof IconClock }> = {
  PENDING: { color: "gray", icon: IconClock },
  IN_PROGRESS: { color: "blue", icon: IconLoader },
  COMPLETED: { color: "green", icon: IconCheck },
  CANCELLED: { color: "red", icon: IconX },
};

export function StepListPane({
  basePath,
  steps,
}: {
  /** /production/work-orders/[id]/steps */
  basePath: string;
  steps: StepNavItem[];
}) {
  return (
    <MasterListNav
      emptyMessage="工程がありません。"
      searchable={steps.length > 8}
      searchPlaceholder="工程名・コードで絞り込み..."
      sections={[
        {
          items: steps.map((s) => {
            const st = STATUS_ICON[s.status] ?? STATUS_ICON.PENDING;
            const isOutsource = s.executionLocation === "OUTSOURCE";
            return {
              href: `${basePath}/${s.id}`,
              searchText: `${s.name} ${s.code}`,
              label: (
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon
                    color={st.color}
                    radius="xl"
                    size="sm"
                    variant="light"
                  >
                    <st.icon size={12} />
                  </ThemeIcon>
                  <Text fw={600} size="sm" truncate>
                    {s.name}
                  </Text>
                  {isOutsource && (
                    <Badge color="orange" size="xs" variant="outline">
                      外注
                    </Badge>
                  )}
                  {s.isInspection && (
                    <Badge color="blue" size="xs" variant="light">
                      検査
                    </Badge>
                  )}
                  {s.isApprovalStep && (
                    <Badge color="teal" size="xs" variant="light">
                      承認
                    </Badge>
                  )}
                </Group>
              ),
              description: [
                s.code,
                (isOutsource ? s.supplierName : s.factoryName) ?? null,
              ]
                .filter(Boolean)
                .join(" · "),
            };
          }),
        },
      ]}
    />
  );
}
