"use client";

/**
 * 詳細画面の共通部品（見出し・項目・明細・関連書類）。
 *
 * 社内の `FieldValue` / `SummaryGrid` を持ち込まないのは、あちらが
 * `PreferencesProvider`（利用者ごとの日付書式・文字倍率）に載っているため。
 * ポータルは社内セッションを持たないので、そこは ja 固定でよい。
 *
 * 狭い画面の作りは design.md §20.2 に従う: 項目のグリッドは 1 列、明細の表は
 * 1 行 = 1 ブロック（列が 4 つあると 1 列 40px になって単価が読めない）。
 */

import {
  Anchor,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconChevronLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  PortalList,
  type PortalListColumn,
} from "@/components/portal/PortalList";
import { formatMoney } from "@/lib/format";
import { portalDocumentLabel } from "@/lib/portal-documents-core";
import type {
  PortalLineItemDto,
  PortalRelatedDocumentDto,
} from "@/lib/portal-progress-core";

/** 一覧へ戻る導線。詳細を直接開いた人（メールのリンク）にも出口が要る。 */
export function PortalBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Anchor component={Link} href={href} size="sm" w="fit-content">
      <Group gap={2} wrap="nowrap">
        <IconChevronLeft size={14} />
        {label}
      </Group>
    </Anchor>
  );
}

export function PortalField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text ff={mono ? "monospace" : undefined} fw={500} size="sm">
        {value ?? "—"}
      </Text>
    </Stack>
  );
}

/** 項目の並び。広い画面で 2 列、狭い画面で 1 列。 */
export function PortalFacts({ children }: { children: ReactNode }) {
  return (
    <Card padding="lg" radius="md" withBorder>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        {children}
      </SimpleGrid>
    </Card>
  );
}

export function PortalLineItems({
  items,
  showPrices,
}: {
  items: readonly PortalLineItemDto[];
  /** 価格を載せない納品書では単価・金額の列ごと出さない。 */
  showPrices: boolean;
}) {
  const tr = useTranslations();

  const columns: PortalListColumn<PortalLineItemDto>[] = [
    {
      key: "label",
      header: tr("common.details"),
      render: (it) => <Text size="sm">{it.label}</Text>,
    },
    {
      key: "quantity",
      header: tr("common.quantity"),
      align: "right",
      render: (it) => (
        <Text size="sm">{it.quantity.toLocaleString("ja-JP")}</Text>
      ),
    },
    ...(showPrices
      ? ([
          {
            key: "unitPrice",
            header: tr("common.unitPrice"),
            align: "right",
            render: (it) => (
              <Text size="sm">
                {it.unitPrice ? formatMoney(Number(it.unitPrice)) : "—"}
              </Text>
            ),
          },
          {
            key: "amount",
            header: tr("common.amount"),
            align: "right",
            render: (it) => (
              <Text size="sm">
                {it.amount ? formatMoney(Number(it.amount)) : "—"}
              </Text>
            ),
          },
        ] as PortalListColumn<PortalLineItemDto>[])
      : []),
  ];

  return (
    <PortalList
      columns={columns}
      empty={tr("portal.documents.noLineItems")}
      mobile={(it) => (
        <Stack gap={3}>
          <Text fw={600} size="sm">
            {it.label}
          </Text>
          <Group gap="md">
            <Text c="dimmed" size="xs">
              {`${tr("common.quantity")} ${it.quantity.toLocaleString("ja-JP")}`}
            </Text>
            {showPrices && it.unitPrice ? (
              <Text c="dimmed" size="xs">
                {formatMoney(Number(it.unitPrice))}
              </Text>
            ) : null}
            {showPrices && it.amount ? (
              <Text fw={500} size="xs">
                {formatMoney(Number(it.amount))}
              </Text>
            ) : null}
          </Group>
        </Stack>
      )}
      // 明細は番号を持たないので、並び順そのものが鍵。
      rowKey={(it) => `${it.label}:${it.quantity}:${it.amount ?? ""}`}
      rows={items}
    />
  );
}

export function PortalRelatedDocuments({
  related,
}: {
  related: readonly PortalRelatedDocumentDto[];
}) {
  const tr = useTranslations();
  if (related.length === 0) return null;
  return (
    <Stack gap="xs">
      <Title order={5}>{tr("portal.common.relatedDocuments")}</Title>
      <Stack gap={4}>
        {related.map((r) => (
          <Anchor
            component={Link}
            href={`/portal/documents/${r.type}/${encodeURIComponent(r.number)}`}
            key={`${r.type}:${r.number}`}
            size="sm"
          >
            <Group gap="xs" wrap="nowrap">
              <Text c="dimmed" size="xs">
                {portalDocumentLabel(r.type, tr)}
              </Text>
              <Text ff="monospace" size="sm">
                {r.number}
              </Text>
              {r.issuedOn ? (
                <Text c="dimmed" size="xs">
                  {r.issuedOn.slice(0, 10)}
                </Text>
              ) : null}
            </Group>
          </Anchor>
        ))}
      </Stack>
    </Stack>
  );
}
