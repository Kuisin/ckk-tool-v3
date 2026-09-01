"use client";

/**
 * RevisionDiff — 任意の 2 版の行差分。変更の周りだけ残して畳む。
 */

import { Box, Group, Paper, Select, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { collapseUnchanged, diffBodies } from "@/lib/line-anchor";

const COLORS: Record<string, string> = {
  add: "var(--mantine-color-green-0)",
  del: "var(--mantine-color-red-0)",
  same: "transparent",
};

const SIGN: Record<string, string> = { add: "+", del: "-", same: " " };

export function RevisionDiff({
  fromBody,
  toBody,
  fromLabel,
  toLabel,
  revisions,
  from,
  to,
  onChange,
}: {
  fromBody: string;
  toBody: string;
  fromLabel: string;
  toLabel: string;
  revisions: { value: string; label: string }[];
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const tr = useTr();
  const isMobile = useIsMobile();
  const rows = useMemo(
    () => collapseUnchanged(diffBodies(fromBody, toBody), 3),
    [fromBody, toBody],
  );

  const changed = rows.filter(
    (r) => !("skipped" in r) && r.kind !== "same",
  ).length;

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" grow={isMobile}>
        <Select
          data={revisions}
          label={tr("比較元")}
          onChange={(v) => onChange(v ?? from, to)}
          value={from}
          w={isMobile ? undefined : 200}
        />
        <Select
          data={revisions}
          label={tr("比較先")}
          onChange={(v) => onChange(from, v ?? to)}
          value={to}
          w={isMobile ? undefined : 200}
        />
        <Text c="dimmed" size="sm">
          {changed === 0
            ? tr("差分はありません")
            : tr("{fromLabel} → {toLabel}: {changed} 行の変更", {
                fromLabel: fromLabel,
                toLabel: toLabel,
                changed: changed,
              })}
        </Text>
      </Group>

      <Paper p={0} radius="md" withBorder>
        <Stack gap={0}>
          {rows.map((row, i) =>
            "skipped" in row ? (
              <Box
                // biome-ignore lint/suspicious/noArrayIndexKey: 畳んだ位置に安定 id が無い
                key={`skip-${i}`}
                px="sm"
                py={4}
                style={{ background: "var(--mantine-color-gray-0)" }}
              >
                <Text c="dimmed" size="xs">
                  … {row.skipped} 行省略 …
                </Text>
              </Box>
            ) : (
              <Group
                gap={0}
                // biome-ignore lint/suspicious/noArrayIndexKey: 行の並びが同一性
                key={`line-${i}`}
                style={{ background: COLORS[row.kind] }}
                wrap="nowrap"
              >
                {/* スマホは行番号を 1 列に絞る（2 列で 96px 取ると本文が読めない）。 */}
                {!isMobile && (
                  <Text
                    c="dimmed"
                    className="tabular-nums"
                    px={6}
                    size="xs"
                    style={{ width: 48, flexShrink: 0, textAlign: "right" }}
                  >
                    {row.oldLine ?? ""}
                  </Text>
                )}
                <Text
                  c="dimmed"
                  className="tabular-nums"
                  px={6}
                  size="xs"
                  style={{
                    width: isMobile ? 36 : 48,
                    flexShrink: 0,
                    textAlign: "right",
                  }}
                >
                  {row.newLine ?? row.oldLine ?? ""}
                </Text>
                <Text
                  ff="mono"
                  px="xs"
                  py={2}
                  size="xs"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {SIGN[row.kind]} {row.text || " "}
                </Text>
              </Group>
            ),
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
