"use client";

/**
 * MovementDetail — 入出庫伝票 詳細 (PD27)。
 *
 * SummaryGrid + 明細（= inventory_transactions の取引行）。読み取り専用の
 * 確定記録なので編集・削除アクションもライフサイクル（ProcedurePanel）も
 * メモタブも持たない — 在庫が動いた出来事をそのまま見せるだけ。
 */

import { Anchor, Badge, Paper, Table, Text } from "@mantine/core";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { auditRecordLink } from "@/lib/audit-links";
import {
  inventoryTypeLabel,
  movementCauseLabel,
  transactionTypeLabel,
} from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import { TRANSACTION_TYPE_COLOR } from "../model";
import {
  MOVEMENT_CAUSE_COLOR,
  type MovementDetail as MovementDetailData,
} from "./model";

const BASE_PATH = "/production/inventory/movements";

export function MovementDetail({ movement }: { movement: MovementDetailData }) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const fmt = useFormat();
  const m = movement;
  const sourceLink = auditRecordLink(m.sourceType ?? "", m.sourceId, locale);

  return (
    <DetailShell
      breadcrumbs={[
        tr("common.production"),
        { label: tr("common.stockMovement"), href: BASE_PATH },
        tr("common.detail"),
      ]}
      createdAt={fmt.dateTime(m.createdAt)}
      status={
        <Badge color={MOVEMENT_CAUSE_COLOR[m.cause] ?? "gray"} variant="light">
          {movementCauseLabel(m.cause, locale)}
        </Badge>
      }
      title={m.movementNumber}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("production.movements.movementNumber")}
          value={<DocNumber>{m.movementNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("common.dateAndTime")}
          value={fmt.dateTime(m.createdAt)}
        />
        <FieldValue
          label={tr("production.movements.cause")}
          value={
            <Badge
              color={MOVEMENT_CAUSE_COLOR[m.cause] ?? "gray"}
              variant="light"
            >
              {movementCauseLabel(m.cause, locale)}
            </Badge>
          }
        />
        <FieldValue label={tr("common.site")} value={m.plantName ?? "—"} />
        <FieldValue
          label={tr("production.movements.sourceDocument")}
          value={
            m.sourceId ? (
              sourceLink ? (
                <Anchor component={Link} href={sourceLink.href} size="sm">
                  <Text c="blue" size="sm" span>
                    {sourceLink.appLabel} {m.sourceId}
                  </Text>
                </Anchor>
              ) : (
                <Text size="sm" span>
                  {m.sourceType} {m.sourceId}
                </Text>
              )
            ) : (
              "—"
            )
          }
        />
        <FieldValue label={tr("common.createdBy")} value={m.createdByName} />
        <FieldValue
          fullWidth
          label={tr("common.notes")}
          value={inventoryNoteLabel(tr, m.notes) ?? "—"}
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Table.ScrollContainer minWidth={760}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.type")}</Table.Th>
                <Table.Th>{tr("common.kind")}</Table.Th>
                <Table.Th>{tr("common.itemName")}</Table.Th>
                <Table.Th>{tr("common.lotNumber")}</Table.Th>
                <Table.Th>
                  {tr("production.movements.storageLocation")}
                </Table.Th>
                <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                <Table.Th>{tr("common.notes")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {m.lines.map((line) => (
                <Table.Tr key={line.id}>
                  <Table.Td>
                    <Badge
                      color={
                        TRANSACTION_TYPE_COLOR[line.transactionType] ?? "gray"
                      }
                      variant="light"
                    >
                      {transactionTypeLabel(line.transactionType, locale)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {inventoryTypeLabel(line.inventoryType, locale)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{line.itemName}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text className="tabular-nums" size="sm">
                      {line.lotNumber ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{line.locationLabel ?? "—"}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text className="tabular-nums" size="sm">
                      {line.quantity} {line.unit}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {inventoryNoteLabel(tr, line.notes) ?? "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </DetailShell>
  );
}
