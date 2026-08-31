"use client";

/**
 * ProductionBoard — 生産ボードの見た目。
 *
 * 外枠（見出し・時計・ページ送り）は BoardFrame が持つので、ここは
 * 「1 行をどう描くか」だけ。テンプレートが増えても見た目が揃うようにするため。
 */

import { Badge, Group, Stack, Text } from "@mantine/core";
import type { BoardEntry } from "@/lib/display-board-core";
import { BoardFrame, BoardRowShell } from "../_shared/BoardFrame";

type Props = {
  entries: BoardEntry[];
  plantName: string | null;
  rowsPerPage: number;
};

export function ProductionBoard({ entries, plantName, rowsPerPage }: Props) {
  return (
    <BoardFrame
      emptyMessage="進行中の指示書はありません"
      items={entries}
      renderRow={(entry) => (
        <BoardRowView entry={entry} key={entry.workOrderId} />
      )}
      rowsPerPage={rowsPerPage}
      subtitle={plantName}
      title="生産状況"
    />
  );
}

function BoardRowView({ entry }: { entry: BoardEntry }) {
  const running = entry.currentStepStatus === "IN_PROGRESS";
  const accent = running
    ? entry.paused
      ? "var(--mantine-color-yellow-5)"
      : "var(--mantine-color-blue-5)"
    : "var(--mantine-color-dark-4)";

  return (
    <BoardRowShell accent={accent}>
      {/* ロット番号 — 現場が口にする番号なので一番大きく */}
      <Text
        ff="monospace"
        fw={700}
        style={{ fontSize: "2rem", minWidth: "5.5ch" }}
      >
        {entry.lotNumber}
      </Text>

      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} style={{ fontSize: "1.5rem" }} truncate>
          {entry.productName}
        </Text>
        <Text c="dimmed" size="md" truncate>
          {entry.assignees.length > 0
            ? entry.assignees.slice(0, 3).join("・") +
              (entry.assignees.length > 3
                ? ` ほか ${entry.assignees.length - 3} 名`
                : "")
            : "担当者未割当"}
        </Text>
      </Stack>

      <Stack align="flex-end" gap={4} style={{ minWidth: "14rem" }}>
        <Group gap="sm" wrap="nowrap">
          <Text fw={600} style={{ fontSize: "1.4rem" }}>
            {entry.currentStepName ?? "—"}
          </Text>
          {running && entry.paused && (
            <Badge color="yellow" size="lg" variant="light">
              一時停止
            </Badge>
          )}
          {running && !entry.paused && (
            <Badge color="blue" size="lg" variant="filled">
              作業中
            </Badge>
          )}
          {entry.currentStepStatus === "PENDING" && (
            <Badge color="gray" size="lg" variant="light">
              未着手
            </Badge>
          )}
        </Group>
        <Text c="dimmed" style={{ fontSize: "1.1rem" }}>
          {entry.completedSteps} / {entry.totalSteps} 工程
        </Text>
      </Stack>

      <Stack align="flex-end" gap={2} style={{ minWidth: "7rem" }}>
        <Text fw={700} style={{ fontSize: "1.8rem" }}>
          {entry.quantity ?? entry.plannedQuantity}
        </Text>
        <Text c="dimmed" size="sm">
          / {entry.plannedQuantity} 本
        </Text>
      </Stack>
    </BoardRowShell>
  );
}
