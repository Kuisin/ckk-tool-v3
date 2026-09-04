"use client";

/**
 * 書類への短いリンク並び（ホームの「最近の書類」）。
 *
 * 一覧（PortalDocumentTabs）と違って種別が混ざるので、番号の前に種別名を出す。
 */

import { Group, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
  PortalList,
  type PortalListColumn,
} from "@/components/portal/PortalList";
import { formatMoney } from "@/lib/format";
import type { PortalDocumentListItem } from "@/lib/portal-documents";
import { portalDocumentLabel } from "@/lib/portal-documents-core";

export function PortalDocumentLinks({
  items,
}: {
  items: PortalDocumentListItem[];
}) {
  const tr = useTranslations();

  const columns: PortalListColumn<PortalDocumentListItem>[] = [
    {
      key: "type",
      header: tr("common.type2"),
      render: (d) => (
        <Text c="dimmed" size="sm">
          {portalDocumentLabel(d.type, tr)}
        </Text>
      ),
    },
    {
      key: "number",
      header: tr("common.documentNumber"),
      render: (d) => (
        <Text ff="monospace" size="sm">
          {d.number}
        </Text>
      ),
    },
    {
      key: "issuedOn",
      header: tr("common.date"),
      render: (d) => <Text size="sm">{d.issuedOn?.slice(0, 10) ?? "—"}</Text>,
    },
    {
      key: "amount",
      header: tr("common.amount"),
      align: "right",
      render: (d) => (
        <Text size="sm">
          {d.totalAmount ? formatMoney(Number(d.totalAmount)) : "—"}
        </Text>
      ),
    },
  ];

  return (
    <PortalList
      columns={columns}
      empty={tr("portal.home.nothingToShow")}
      href={(d) =>
        `/portal/documents/${d.type}/${encodeURIComponent(d.number)}`
      }
      mobile={(d) => (
        <Group align="flex-start" justify="space-between" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text ff="monospace" fw={600} size="sm">
              {d.number}
            </Text>
            <Text c="dimmed" size="xs">
              {portalDocumentLabel(d.type, tr)}
              {d.issuedOn ? ` · ${d.issuedOn.slice(0, 10)}` : ""}
            </Text>
          </div>
          {d.totalAmount ? (
            <Text fw={500} size="xs" style={{ flexShrink: 0 }}>
              {formatMoney(Number(d.totalAmount))}
            </Text>
          ) : null}
        </Group>
      )}
      rowKey={(d) => `${d.type}:${d.number}`}
      rows={items}
    />
  );
}
