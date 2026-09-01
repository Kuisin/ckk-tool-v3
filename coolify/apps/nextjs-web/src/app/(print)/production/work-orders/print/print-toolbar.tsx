"use client";

/**
 * PrintToolbar — 指示書ストリップ印刷の画面上部ツールバー。
 *
 * 「印刷」（window.print）だけ。@media print で非表示（スタイルは
 * print/page.tsx 側の .wo-strip-toolbar 規則）。
 *
 * PDF 経路は用意していない — PDF になると CSS の絶対ページボックスが効かず、
 * ビューアの「印刷可能領域に合わせる」で縮むため、原寸を担保できない。
 */

import { Group, Text } from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { PrimaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";

export function PrintToolbar({ count }: { count: number }) {
  const tr = useTr();
  return (
    <Group className="wo-strip-toolbar" justify="space-between" mb="md">
      <Text fw={600} size="sm">
        指示書ストリップ（{count}枚）
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
