"use client";

/**
 * BoardFrame — ディスプレイの画面に共通の外枠。
 *
 * 見出し・時計・ページ送りをここに集めているのは、テンプレートが増えても
 * **「遠くから、触らずに読める」形を崩さない**ため。各テンプレートは行の
 * 描き方だけを持てばよく、スクロールやページングを毎回考えなくて済む。
 *
 * 約束ごと（_specs/design.md §20.1 のタブレット規約をさらに一段拡大）:
 *   - **スクロールしない。** 収まらない分はページ送りで順に見せる
 *     （誰も触らない画面では、画面外に出た情報は存在しないのと同じ）
 *   - 押せるものを置かない（誤操作の余地しか生まない）
 *   - 時計を出す。「この画面は生きている」が一目で分かる
 */

import { Box, Group, Stack, Text, Title } from "@mantine/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { pageIndexAt, paginate } from "@/lib/display-board-core";

/** ページ送りの間隔。読み切れる長さを優先して長めに取る。 */
const PAGE_INTERVAL_MS = 15_000;

type Props<T> = {
  title: string;
  subtitle?: string | null;
  /** 見出しの右に出す一言（件数など）。 */
  badge?: ReactNode;
  items: T[];
  rowsPerPage: number;
  emptyMessage: string;
  renderRow: (item: T, index: number) => ReactNode;
  /** 一覧の上に固定で出す要素（集計など）。ページ送りしない。 */
  header?: ReactNode;
};

export function BoardFrame<T>({
  title,
  subtitle,
  badge,
  items,
  rowsPerPage,
  emptyMessage,
  renderRow,
  header,
}: Props<T>) {
  const pages = paginate(items, rowsPerPage);
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
          {subtitle && (
            <Text c="dimmed" style={{ fontSize: "1.4rem" }}>
              {subtitle}
            </Text>
          )}
          {badge}
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

      {header}

      {items.length === 0 ? (
        <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Text c="dimmed" style={{ fontSize: "2rem" }}>
            {emptyMessage}
          </Text>
        </Box>
      ) : (
        <Stack gap="sm" style={{ flex: 1 }}>
          {page.map((item, i) => renderRow(item, i))}
        </Stack>
      )}
    </Stack>
  );
}

/** 行の共通ガワ（左に色の帯 + 中身）。テンプレート間で見た目を揃える。 */
export function BoardRowShell({
  accent = "var(--mantine-color-dark-4)",
  children,
}: {
  accent?: string;
  children: ReactNode;
}) {
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
      {children}
    </Group>
  );
}

export function Clock() {
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
