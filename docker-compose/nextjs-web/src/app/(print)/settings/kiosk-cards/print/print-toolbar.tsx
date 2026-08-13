"use client";

/**
 * PrintToolbar — QRカード印刷シートの画面上部ツールバー。
 *
 * 「印刷」ボタン（window.print）と枚数表示のみ。@media print で非表示
 * （スタイルは print/page.tsx 側の .kiosk-print-toolbar 規則）。
 */

import { Group, Text } from "@mantine/core";
import { IconPrinter } from "@tabler/icons-react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";

export function PrintToolbar({ count }: { count: number }) {
  return (
    <Group className="kiosk-print-toolbar" justify="space-between" mb="md">
      <Text fw={600} size="sm">
        QRカード印刷シート（{count}枚）
      </Text>
      <Group gap="xs">
        <SecondaryButton onClick={() => window.close()}>閉じる</SecondaryButton>
        <PrimaryButton
          disabled={count === 0}
          leftSection={<IconPrinter size={16} />}
          onClick={() => window.print()}
        >
          印刷
        </PrimaryButton>
      </Group>
    </Group>
  );
}
