"use client";

import { Anchor, Badge, Table, Tabs, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { PortalDocumentListItem } from "@/lib/portal-documents";
import {
  type PortalDocumentType,
  portalDocumentLabel,
} from "@/lib/portal-documents-core";

export function PortalDocumentTabs({
  groups,
}: {
  groups: { type: PortalDocumentType; items: PortalDocumentListItem[] }[];
}) {
  const tr = useTranslations();
  const first = groups.find((g) => g.items.length > 0)?.type ?? groups[0]?.type;
  return (
    <Tabs defaultValue={first}>
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
          {g.items.length === 0 ? (
            <Text c="dimmed" size="sm">
              {tr("portal.documents.noneToShow", {
                document: portalDocumentLabel(g.type, tr),
              })}
            </Text>
          ) : (
            <Table highlightOnHover striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.documentNumber")}</Table.Th>
                  <Table.Th>{tr("common.date")}</Table.Th>
                  <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {g.items.map((d) => (
                  <Table.Tr key={d.number}>
                    <Table.Td>
                      <Anchor
                        href={`/portal/documents/${g.type}/${encodeURIComponent(d.number)}`}
                        size="sm"
                      >
                        <Text ff="monospace" size="sm">
                          {d.number}
                        </Text>
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{d.issuedOn?.slice(0, 10) ?? "—"}</Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm">
                        {d.totalAmount
                          ? `¥${Number(d.totalAmount).toLocaleString("ja-JP")}`
                          : "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      ))}
    </Tabs>
  );
}
