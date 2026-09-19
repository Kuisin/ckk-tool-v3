"use client";

/**
 * RequirementsView — 在庫・所要量 (ST03)。
 *
 * 品目 1 つ × 拠点 1 つを選ぶと、過去の実績（inventory_transactions）と
 * 未来の供給・需要（発注残 / 指示書予定・受注残 / 引当予約）を 1 本の時系列に
 * 積んだ表を出す。ST02 在庫一覧（場所から見る）とは向きが逆で、入口も別。
 *
 * 品目・拠点はどちらも URL の写し（`useUrlSelectState(..., "server")`）—
 * 選び直すたびにサーバー往復して `fetchStockRequirements` を呼び直す
 * （素材発注・指示書・注文明細をまたぐ集計はクライアントに送るには重い）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Group,
  Select,
  Table,
  Text,
} from "@mantine/core";
import { IconAlertTriangle, IconChartLine } from "@tabler/icons-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { ListShell, SummaryGrid } from "@/components/ui/shells";
import { useUrlSelectState } from "@/hooks/useUrlState";
import { categoryLabel } from "@/lib/app-list";
import { itemTypeLabel, stockRequirementRowKindLabel } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import { inventoryNoteLabel } from "@/lib/inventory-note-labels";
import type { RecentOption } from "@/lib/recents";
import { ItemPicker } from "./ItemPicker";
import { ROW_KIND_COLOR, type StockRequirementsView } from "./model";

export function RequirementsView({
  result,
  plantOptions,
  initialItemOption,
}: {
  result: StockRequirementsView | null;
  plantOptions: { value: string; label: string }[];
  /** 選択中品目の SearchSelect 初期表示ラベル（無選択・未取得なら null）。 */
  initialItemOption: RecentOption | null;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const fmt = useFormat();

  const [itemId, setItemId] = useUrlSelectState("item", "server");
  const [plantId, setPlantId] = useUrlSelectState("plant", "server");

  const unit = result?.item.unit ?? "";

  return (
    <ListShell
      breadcrumbs={[
        categoryLabel("在庫", locale),
        tr("inventory.requirements.title"),
      ]}
      filters={
        <Group align="flex-end" gap="xs" wrap="wrap">
          <ItemPicker
            initialOption={initialItemOption}
            label={tr("inventory.requirements.item")}
            onChange={setItemId}
            placeholder={tr("inventory.requirements.itemPlaceholder")}
            value={itemId}
          />
          <Select
            clearable
            data={plantOptions}
            label={tr("common.site")}
            onChange={setPlantId}
            placeholder={tr("inventory.requirements.plantPlaceholder")}
            value={plantId}
            w={220}
          />
        </Group>
      }
      title={tr("inventory.requirements.title")}
    >
      {!itemId || !plantId ? (
        <EmptyState
          icon={<IconChartLine size={28} />}
          message={tr("inventory.requirements.emptyState")}
        />
      ) : !result ? (
        <EmptyState
          icon={<IconChartLine size={28} />}
          message={tr("inventory.requirements.notFound")}
        />
      ) : (
        <>
          <SummaryGrid cols={4}>
            <FieldValue
              label={tr("inventory.requirements.item")}
              value={
                <Group gap="xs" wrap="nowrap">
                  <Text component="span" size="sm">
                    {result.item.code ?? "—"} {result.item.name}
                  </Text>
                  <Badge size="xs" variant="light">
                    {itemTypeLabel(result.item.itemType, locale)}
                  </Badge>
                </Group>
              }
            />
            <FieldValue label={tr("common.site")} value={result.plant.name} />
            <FieldValue
              label={tr("inventory.requirements.onHand")}
              value={`${result.onHand} ${unit}`}
            />
            <FieldValue
              label={tr("inventory.requirements.reserved")}
              value={`${result.reserved} ${unit}`}
            />
            <FieldValue
              label={tr("inventory.requirements.availableNow")}
              value={`${result.availableNow} ${unit}`}
            />
            <FieldValue
              label={tr("inventory.requirements.nextReceipt")}
              value={
                result.nextReceiptDate ? fmt.date(result.nextReceiptDate) : "—"
              }
            />
          </SummaryGrid>

          {result.firstNegativeKey && (
            <Alert
              color="red"
              icon={<IconAlertTriangle size={16} />}
              mt="md"
              title={tr("inventory.requirements.shortageAlertTitle")}
            >
              {tr("inventory.requirements.shortageAlertBody")}
            </Alert>
          )}
          {result.truncated && (
            <Alert
              color="orange"
              icon={<IconAlertTriangle size={16} />}
              mt="md"
            >
              {tr("inventory.requirements.truncated")}
            </Alert>
          )}

          <Table.ScrollContainer minWidth={760} mt="md">
            <Table highlightOnHover={false}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.date")}</Table.Th>
                  <Table.Th>
                    {tr("inventory.requirements.rowKindHeader")}
                  </Table.Th>
                  <Table.Th>{tr("inventory.requirements.reference")}</Table.Th>
                  <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                  <Table.Th ta="right">
                    {tr("inventory.requirements.balance")}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {result.rows.map((row) => {
                  const isFirstNegative = row.key === result.firstNegativeKey;
                  return (
                    <Table.Tr
                      bg={isFirstNegative ? "red.0" : undefined}
                      key={row.key}
                    >
                      <Table.Td>
                        <Text size="sm">
                          {row.kind === "now"
                            ? tr("inventory.requirements.rowKind.now")
                            : row.kind === "past"
                              ? fmt.dateTime(row.date)
                              : row.date
                                ? fmt.date(row.date)
                                : tr("inventory.requirements.dateUndetermined")}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ROW_KIND_COLOR[row.kind]} variant="light">
                          {stockRequirementRowKindLabel(row.kind, locale)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {row.ref ? (
                          row.refHref ? (
                            <Anchor
                              component={Link}
                              href={row.refHref}
                              size="sm"
                            >
                              <DocNumber c="blue">{row.ref}</DocNumber>
                            </Anchor>
                          ) : (
                            <DocNumber>{row.ref}</DocNumber>
                          )
                        ) : row.note ? (
                          <Text c="dimmed" size="sm">
                            {inventoryNoteLabel(tr, row.note)}
                          </Text>
                        ) : (
                          <Text c="dimmed" size="sm">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text
                          c={
                            row.quantity != null && row.quantity < 0
                              ? "red"
                              : undefined
                          }
                          className="tabular-nums"
                          size="sm"
                        >
                          {row.quantity != null
                            ? `${row.quantity > 0 ? "+" : ""}${row.quantity} ${unit}`
                            : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text
                          c={row.balance < 0 ? "red" : undefined}
                          className="tabular-nums"
                          fw={isFirstNegative ? 700 : undefined}
                          size="sm"
                        >
                          {row.balance} {unit}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </>
      )}
    </ListShell>
  );
}
