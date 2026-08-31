"use client";

/**
 * ProductionBoard — 生産ボードの見た目。
 *
 * 「遠くから、触らずに読める」ことだけを狙う:
 *   - 行は大きく、色は少なく（進行中だけ目立たせる）
 *   - **スクロールしない。** 1 画面に入らない分はページ送りで順に見せる
 *     （誰も触らない画面では、画面外に出た情報は存在しないのと同じ）
 *   - 押せるものを置かない（誤操作の余地しか生まない）
 *
 * ページ送りは経過時間から出す（display-board-core の pageIndexAt）ので、
 * この部品は「いま何ページ目か」の状態を持たない。
 */

import { Badge, Box, Group, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import {
  type BoardEntry,
  pageIndexAt,
  paginate,
} from "@/lib/display-board-core";

/** 1 画面に出す行数。テレビの高さで決め打ち（可変にすると読みづらさが揺れる）。 */
const ROWS_PER_PAGE = 8;
/** ページ送りの間隔。読み切れる長さを優先して長めに取る。 */
const PAGE_INTERVAL_MS = 15_000;

type Props = {
  entries: BoardEntry[];
  plantName: string | null;
  title: string;
};

export function ProductionBoard({ entries, plantName, title }: Props) {
  const pages = paginate(entries, ROWS_PER_PAGE);
  const mountedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Date.now() - mountedAt.current),
      1000,
    );
    return () => clearInterval(id);
  }, []);

  const pageIndex = pageIndexAt(elapsed, pages.length, PAGE_INTERVAL_MS);
  const page = pages[pageIndex] ?? [];

  return (
    <Stack
      gap={0}
      style={{ height: "100dvh", overflow: "hidden", padding: "1.5rem 2rem" }}
    >
      <Group justify="space-between" mb="md" wrap="nowrap">
        <Group align="baseline" gap="lg" wrap="nowrap">
          <Title order={1} style={{ fontSize: "2.4rem" }}>
            {title}
          </Title>
          {plantName && (
            <Text c="dimmed" style={{ fontSize: "1.4rem" }}>
              {plantName}
            </Text>
          )}
        </Group>
        <Group gap="lg" wrap="nowrap">
          {pages.length > 1 && (
            <Text c="dimmed" style={{ fontSize: "1.2rem" }}>
              {pageIndex + 1} / {pages.length}
            </Text>
          )}
          <Clock />
        </Group>
      </Group>

      {entries.length === 0 ? (
        <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Text c="dimmed" style={{ fontSize: "2rem" }}>
            進行中の指示書はありません
          </Text>
        </Box>
      ) : (
        <Stack gap="sm" style={{ flex: 1 }}>
          {page.map((entry) => (
            <BoardRowView entry={entry} key={entry.workOrderId} />
          ))}
        </Stack>
      )}
    </Stack>
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
    <Group
      align="center"
      gap="lg"
      style={{
        background: "var(--mantine-color-dark-6)",
        borderLeft: `6px solid ${accent}`,
        borderRadius: "var(--mantine-radius-md)",
        padding: "0.75rem 1.25rem",
      }}
      wrap="nowrap"
    >
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
    </Group>
  );
}

/** 時計。テレビに出ていると「この画面は生きている」ことが一目で分かる。 */
function Clock() {
  const [now, setNow] = useState<string>("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <Text ff="monospace" fw={600} style={{ fontSize: "1.8rem" }}>
      {now}
    </Text>
  );
}
