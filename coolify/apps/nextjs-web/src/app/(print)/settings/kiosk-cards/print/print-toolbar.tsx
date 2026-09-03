"use client";

/**
 * PrintToolbar — QRカード印刷シートの画面上部ツールバー。
 *
 * 「印刷」（window.print）と「PDFで保存」のみ。@media print で非表示
 * （スタイルは print/page.tsx 側の .kiosk-print-toolbar 規則）。
 *
 * 印刷は **ブラウザ印刷が主経路**。CSS の `@page { size: 210mm 297mm }` は
 * 絶対ページボックスなので UA は用紙に合わせて縮小できず、カードは常に
 * 原寸 91×55mm で出る。PDF は保存・配布用。
 */

import { Group, Text } from "@mantine/core";
import { IconFileTypePdf, IconPrinter } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";

export function PrintToolbar({
  count,
  pdfHref,
}: {
  count: number;
  pdfHref: string;
}) {
  const tr = useTranslations();
  return (
    <Group className="kiosk-print-toolbar" justify="space-between" mb="md">
      <Text fw={600} size="sm">
        QRカード印刷シート（{count}枚）
      </Text>
      <Group gap="xs">
        <SecondaryButton
          external
          href={pdfHref}
          leftSection={<IconFileTypePdf size={16} />}
        >
          {tr("settings.kioskCards.saveAsPdf")}
        </SecondaryButton>
        <PrimaryButton
          disabled={count === 0}
          leftSection={<IconPrinter size={16} />}
          onClick={() => window.print()}
        >
          {tr("common.print2")}
        </PrimaryButton>
      </Group>
    </Group>
  );
}
