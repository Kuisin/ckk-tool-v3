"use client";

/**
 * 書類の一覧（種別ごとのタブ）。
 *
 * タブは `AppTabs` を通す（design.md §10.11）—— 4 種別あるので、狭い画面では
 * 横並びをやめてドロップダウンになる。横スクロールにすると、いま開いている
 * タブが画面の外に隠れる。
 */

import { Badge, Tabs, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import {
  PortalList,
  type PortalListColumn,
} from "@/components/portal/PortalList";
import { AppTabs } from "@/components/ui/AppTabs";
import { formatMoney } from "@/lib/format";
import type { PortalDocumentListItem } from "@/lib/portal-documents";
import {
  type PortalDocumentType,
  portalDocumentLabel,
} from "@/lib/portal-documents-core";

function href(type: PortalDocumentType, number: string): string {
  return `/portal/documents/${type}/${encodeURIComponent(number)}`;
}

export function PortalDocumentTabs({
  groups,
}: {
  groups: { type: PortalDocumentType; items: PortalDocumentListItem[] }[];
}) {
  const tr = useTranslations();
  // 中身のあるタブを最初に開く（空のタブで迎えない）。
  const first = groups.find((g) => g.items.length > 0)?.type ?? groups[0]?.type;

  const columns: PortalListColumn<PortalDocumentListItem>[] = [
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
    <AppTabs defaultValue={first}>
      <Tabs.List>
        {groups.map((g) => (
          <Tabs.Tab
            key={g.type}
            rightSection={
              g.items.length ? (
                <Badge circle size="xs" variant="light">
                  {g.items.length}
                </Badge>
              ) : null
            }
            value={g.type}
          >
            {portalDocumentLabel(g.type, tr)}
          </Tabs.Tab>
        ))}
      </Tabs.List>

      {groups.map((g) => (
        <Tabs.Panel key={g.type} pt="md" value={g.type}>
          <PortalList
            columns={columns}
            empty={tr("portal.documents.noneToShow", {
              document: portalDocumentLabel(g.type, tr),
            })}
            href={(d) => href(g.type, d.number)}
            mobile={(d) => (
              <>
                <Text ff="monospace" fw={600} size="sm">
                  {d.number}
                </Text>
                <Text c="dimmed" size="xs">
                  {d.issuedOn?.slice(0, 10) ?? "—"}
                  {d.totalAmount
                    ? ` · ${formatMoney(Number(d.totalAmount))}`
                    : ""}
                </Text>
              </>
            )}
            rowKey={(d) => d.number}
            rows={g.items}
          />
        </Tabs.Panel>
      ))}
    </AppTabs>
  );
}
