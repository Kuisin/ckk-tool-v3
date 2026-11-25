"use client";

/**
 * 注文の進捗の一覧。
 *
 * 行は注文明細（`ORD-FFFF-NNNNN-NN`）1 件で、押すとその 1 件の詳細へ。
 * 枝番が採番されていない行は番号を持たない（＝確定前）ので開けない —— が、
 * サーバー側で `branch: { not: null }` に絞ってあるので通常は現れない。
 */

import { Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
  PortalList,
  type PortalListColumn,
} from "@/components/portal/PortalList";
import { PortalProgressBadge } from "@/components/portal/PortalProgress";
import { formatMoney } from "@/lib/format";
import type { PortalOrderLineRow } from "@/lib/portal-progress";

/** 表示番号。枝番が無い行（確定前）は請書の番号のまま出し、開かせない。 */
function lineNumber(r: PortalOrderLineRow): string {
  return r.number ?? r.acceptanceNumber;
}

export function PortalOrderTable({ rows }: { rows: PortalOrderLineRow[] }) {
  const tr = useTranslations();

  const columns: PortalListColumn<PortalOrderLineRow>[] = [
    {
      key: "number",
      header: tr("portal.portalOrderTable.orderNumber"),
      render: (r) => (
        <Text ff="monospace" size="sm">
          {lineNumber(r)}
        </Text>
      ),
    },
    {
      key: "product",
      header: tr("common.product"),
      render: (r) => <Text size="sm">{r.productName}</Text>,
    },
    {
      key: "quantity",
      header: tr("common.quantity"),
      align: "right",
      render: (r) => (
        <Text size="sm">{r.quantity.toLocaleString("ja-JP")}</Text>
      ),
    },
    {
      key: "deliveryDate",
      header: tr("common.deliveryDate"),
      render: (r) => <Text size="sm">{r.deliveryDate ?? "—"}</Text>,
    },
    {
      key: "progress",
      header: tr("portal.portalOrderTable.status"),
      render: (r) => <PortalProgressBadge progress={r.progress} />,
    },
  ];

  return (
    <PortalList
      columns={columns}
      empty={tr("portal.orders.thereAreNoOrdersToShow")}
      // リンクは id（`CKK~ORD-2026-00001-01`）で張る — 同じ番号の明細が別の
      // 自社法人にもあり得る。表示は番号だけ。
      href={(r) =>
        r.id == null ? null : `/portal/orders/${encodeURIComponent(r.id)}`
      }
      mobile={(r) => (
        <Group
          align="flex-start"
          gap="sm"
          justify="space-between"
          wrap="nowrap"
        >
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Text c="dimmed" ff="monospace" size="xs">
              {lineNumber(r)}
            </Text>
            <Text fw={600} size="sm" truncate>
              {r.productName}
            </Text>
            <Group gap="md">
              <Text c="dimmed" size="xs">
                {r.quantity.toLocaleString("ja-JP")}
              </Text>
              {r.amount ? (
                <Text fw={500} size="xs">
                  {formatMoney(Number(r.amount))}
                </Text>
              ) : null}
            </Group>
          </Stack>
          <Stack align="flex-end" gap={4} style={{ flexShrink: 0 }}>
            <PortalProgressBadge progress={r.progress} />
            <Text c="dimmed" size="xs">
              {r.deliveryDate ?? "—"}
            </Text>
          </Stack>
        </Group>
      )}
      rowKey={(r) => r.id ?? `${r.acceptanceId}:${lineNumber(r)}`}
      rows={rows}
    />
  );
}
