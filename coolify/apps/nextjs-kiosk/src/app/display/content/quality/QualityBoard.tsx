"use client";

import { Badge, Group, Paper, Text } from "@mantine/core";
import { useI18n } from "@/components/I18nProvider";
import type { QualitySummary } from "@/lib/display-board";
import { fillMessage } from "@/lib/i18n";
import { BoardFrame, BoardRowShell } from "../_shared/BoardFrame";

/**
 * 品質・不良の見た目。
 *
 * 合計を大きく 1 つ出してから、種類ごとの内訳を多い順に並べる。
 * 朝礼で「今週どこが多いか」を 1 秒で見るための形。
 */
export function QualityBoard({
  summary,
  plantName,
  rowsPerPage,
}: {
  summary: QualitySummary;
  plantName: string | null;
  rowsPerPage: number;
}) {
  const { m } = useI18n();
  const b = m.display.board.quality;
  const max = summary.rows[0]?.count ?? 1;

  return (
    <BoardFrame
      badge={
        <Badge
          color={summary.totalDefects > 0 ? "orange" : "green"}
          size="xl"
          variant="light"
        >
          {fillMessage(b.recentDaysTotal, {
            days: summary.days,
            count: summary.totalDefects,
          })}
        </Badge>
      }
      emptyMessage={b.empty}
      header={
        summary.totalDefects > 0 ? (
          <Paper
            mb="md"
            p="md"
            radius="md"
            style={{ background: "var(--mantine-color-dark-6)" }}
          >
            <Group align="baseline" gap="md">
              <Text fw={700} style={{ fontSize: "3rem" }}>
                {summary.totalDefects}
              </Text>
              <Text c="dimmed" style={{ fontSize: "1.3rem" }}>
                {fillMessage(b.unitCountDays, { days: summary.days })}
              </Text>
            </Group>
          </Paper>
        ) : undefined
      }
      items={summary.rows}
      renderRow={(row) => (
        <BoardRowShell accent="var(--mantine-color-orange-5)" key={row.id}>
          <Text fw={600} style={{ flex: 1, fontSize: "1.5rem" }} truncate>
            {row.defectTypeName}
          </Text>

          {/* 件数の比較は棒で。数字だけだと遠くから大小が読めない */}
          <div
            style={{
              background: "var(--mantine-color-orange-5)",
              borderRadius: 4,
              height: "1.2rem",
              width: `${Math.max(4, (row.count / max) * 100) * 0.35}%`,
            }}
          />

          <Text
            fw={700}
            style={{ fontSize: "1.8rem", minWidth: "4ch" }}
            ta="right"
          >
            {row.count}
          </Text>
        </BoardRowShell>
      )}
      rowsPerPage={rowsPerPage}
      subtitle={plantName}
      title={b.title}
    />
  );
}
