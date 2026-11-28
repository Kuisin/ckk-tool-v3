"use client";

/**
 * StepSeriesMemoSection — 工程実行画面の「系列メモ」（図面の全版で共通の
 * メモ。読むだけ）。書き直しは Web の設計図で行う。
 *
 * 本文は平文（改行つき）— 共有端末にリッチテキストの描画部品は持ち込まない
 * （lib/design-series-memo.ts）。メモが無ければ何も描かない。
 */

import { Paper, Stack, Text, Title } from "@mantine/core";
import type { KioskSeriesMemo } from "@/lib/design-series-memo";
import { fillMessage } from "@/lib/i18n";
import { useI18n } from "../I18nProvider";

export function StepSeriesMemoSection({
  memo,
}: {
  memo: KioskSeriesMemo | null;
}) {
  const { m } = useI18n();
  if (!memo) return null;
  return (
    <Paper data-series-memo p="md" radius="md" withBorder>
      <Stack gap="xs">
        <Title order={4}>{m.steps.seriesMemo.title}</Title>
        <Text c="dimmed" size="sm">
          {fillMessage(m.steps.seriesMemo.hint, {
            series: memo.customerName ?? m.steps.seriesMemo.generic,
          })}
        </Text>
        <Text style={{ whiteSpace: "pre-wrap" }}>{memo.text}</Text>
      </Stack>
    </Paper>
  );
}
