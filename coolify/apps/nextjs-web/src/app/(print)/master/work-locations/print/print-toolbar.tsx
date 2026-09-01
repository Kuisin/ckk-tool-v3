"use client";

/**
 * PrintToolbar — 作業場所 QR ラベル印刷シートの画面上部ツールバー。
 *
 * 「印刷」（window.print）のみ。@media print で非表示（スタイルは
 * print/page.tsx 側の .wl-print-toolbar 規則）。印刷はブラウザ印刷が主経路
 * （`@page` の絶対ページボックスで原寸を担保 — lib/kiosk-card-sheet.ts 参照）。
 */

import { Group, Text } from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { PrimaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";

export function PrintToolbar({ count }: { count: number }) {
  const tr = useTr();
  return (
    <Group className="wl-print-toolbar" justify="space-between" mb="md">
      <Text fw={600} size="sm">
        作業場所QRラベル（{count}枚）
      </Text>
      <PrimaryButton
        disabled={count === 0}
        leftSection={<IconPrinter size={16} />}
        onClick={() => window.print()}
      >
        {tr("印刷")}
      </PrimaryButton>
    </Group>
  );
}
