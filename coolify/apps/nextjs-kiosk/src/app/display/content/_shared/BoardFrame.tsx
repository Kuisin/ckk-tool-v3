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
import { fitRowsToHeight } from "@/lib/display-core";

/** ページ送りの間隔。読み切れる長さを優先して長めに取る。 */
const PAGE_INTERVAL_MS = 15_000;

/** 行間（Stack gap="sm" 相当）。行数の見積もりに使う。 */
const ROW_GAP_PX = 12;

type Props<T> = {
  title: string;
  subtitle?: string | null;
  /** 見出しの右に出す一言（件数など）。 */
  badge?: ReactNode;
  items: T[];
  rowsPerPage: number;
  emptyMessage: string;
  renderRow: (item: T, index: number) => ReactNode;
  /** 行の安定キー。省略すると並び順を使う（並びが変わるとちらつく）。 */
  rowKey?: (item: T, index: number) => string;
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
  rowKey = (_item, index) => String(index),
  header,
}: Props<T>) {
  const mountedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // 実際に入る行数。倍率（表示%）を上げると 1 行が大きくなり、設定した件数が
  // 入らなくなる。**入らないぶんを黙って切り落とすと、下の行は存在しないのと
  // 同じ**になる（壁の画面はスクロールできないので誰も気づけない）ので、
  // 入る数まで減らしてページ送りへ回す。
  const listRef = useRef<HTMLDivElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [effectiveRows, setEffectiveRows] = useState(rowsPerPage);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const rowPx = rowRef.current?.getBoundingClientRect().height ?? 0;
      setEffectiveRows(
        fitRowsToHeight(
          list.getBoundingClientRect().height,
          rowPx,
          ROW_GAP_PX,
          rowsPerPage,
        ),
      );
    };
    measure();
    // 倍率の変更・画面回転・アドレスバーの出入りでは resize が来ないことが
    // あるので、入れ物そのものを観測する（_specs/design.md §20.3）。
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    if (rowRef.current) observer.observe(rowRef.current);
    return () => observer.disconnect();
  }, [rowsPerPage]);

  const pages = paginate(items, effectiveRows);

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
    // height:100% — 外側（iframe）が既に画面ぶんの高さを持っているので、
    // ここで 100dvh を取り直すと共通見出しのぶんだけはみ出す
    <Stack
      gap={0}
      style={{ height: "100%", overflow: "hidden", padding: "1.5rem 2rem" }}
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
        {/* 時計は画面共通の見出し（DisplayShell）に出るので、ここには置かない */}
        {pages.length > 1 && (
          <Text c="dimmed" style={{ fontSize: "1.2rem" }}>
            {pageIndex + 1} / {pages.length}
          </Text>
        )}
      </Group>

      {header}

      {items.length === 0 ? (
        <Box style={{ flex: 1, display: "grid", placeItems: "center" }}>
          <Text c="dimmed" style={{ fontSize: "2rem" }}>
            {emptyMessage}
          </Text>
        </Box>
      ) : (
        // minHeight: 0 が無いと flex の子は中身より小さくならず、測っても
        // 常に「全部入る」高さが返ってきて行数の調整が効かない
        <Stack
          gap="sm"
          ref={listRef}
          style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          {page.map((item, i) => (
            // 1 行目だけ測れば足りる（行の高さは揃えてある）
            <div key={rowKey(item, i)} ref={i === 0 ? rowRef : undefined}>
              {renderRow(item, i)}
            </div>
          ))}
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
