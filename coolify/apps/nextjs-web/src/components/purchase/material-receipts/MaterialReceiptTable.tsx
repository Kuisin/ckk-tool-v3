"use client";

/**
 * MaterialReceiptTable — 素材入荷 一覧 (PU03, design.md §8.1 / §14)。
 *
 * Columns: 素材（コード+名称）/ 仕入先 / 入荷拠点 / 数量 / 入荷日 /
 * 発注明細（PO番号リンク or 直接調達）。
 * フィルタ: 検索（素材・仕入先・PO番号）+ 入荷区分。行クリック → 詳細。
 */

import {
  Anchor,
  Badge,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import {
  IconFileImport,
  IconPackageImport,
  IconSearch,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { MaterialReceiptView } from "./model";

const BASE_PATH = "/purchase/material-receipts";
const PO_PATH = "/purchase/purchase-orders";

export function MaterialReceiptTable({
  rows,
}: {
  rows: MaterialReceiptView[];
}) {
  const tr = useTranslations();
  const SOURCE_OPTIONS = [
    { value: "po", label: tr("purchase.materialReceiptTable.poReceipt") },
    { value: "direct", label: tr("common.directPurchase") },
  ];
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [source, setSource] = useUrlSelectState("source");

  const reset = () => {
    setSearch(null);
    setSource(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.materialCode.includes(search) ||
      r.materialName.includes(search) ||
      (r.supplierName ?? "").includes(search) ||
      (r.poNumber ?? "").includes(search);
    const matchesSource =
      !source || (source === "po" ? r.poNumber != null : r.poNumber == null);
    return matchesSearch && matchesSource;
  });

  const columns: Column<MaterialReceiptView>[] = [
    {
      key: "material",
      header: tr("common.materials"),
      sortable: true,
      sortValue: (r) => r.materialCode,
      render: (r) => (
        <>
          <Text ff="mono" size="sm">
            {r.materialCode}
          </Text>
          <Text c="dimmed" size="xs">
            {r.materialName}
          </Text>
        </>
      ),
    },
    {
      key: "supplierName",
      header: tr("common.supplier"),
      sortable: true,
      sortValue: (r) => r.supplierName ?? "",
      render: (r) => r.supplierName ?? "—",
    },
    {
      key: "plantName",
      header: tr("purchase.materialReceipts.receivingSite"),
      sortValue: (r) => r.plantName ?? "",
      render: (r) => r.plantName ?? "—",
    },
    {
      key: "quantity",
      header: tr("common.quantity"),
      align: "right",
      width: 110,
      sortValue: (r) => r.quantity,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.quantity} {r.unit}
        </Text>
      ),
    },
    {
      key: "receivedAt",
      header: tr("common.receivedDate"),
      width: 120,
      sortable: true,
      sortValue: (r) => r.receivedAt,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {fmt.date(r.receivedAt)}
        </Text>
      ),
    },
    {
      key: "poNumber",
      header: tr("common.orderLines"),
      width: 170,
      sortValue: (r) => r.poNumber ?? "",
      render: (r) =>
        r.poNumber ? (
          <Anchor
            component={Link}
            href={`${PO_PATH}/${r.poNumber}`}
            onClick={(e) => e.stopPropagation()}
            size="sm"
          >
            <Text c="blue" className="tabular-nums" ff="mono" size="sm" span>
              {r.poNumber}
            </Text>
          </Anchor>
        ) : (
          <Badge color="gray" variant="light">
            {tr("common.directPurchase")}
          </Badge>
        ),
    },
  ];

  return (
    <ListShell
      action={
        <Group gap="xs" wrap="nowrap">
          {/* 納品書 1 枚から複数行をまとめて登録する入口（AI 読み取り）。 */}
          <SecondaryButton
            href={`${BASE_PATH}/intake`}
            leftSection={<IconFileImport size={14} />}
          >
            {tr("purchase.intake.fromDeliveryNote")}
          </SecondaryButton>
          <NewButton href={`${BASE_PATH}/new`} />
        </Group>
      }
      breadcrumbs={[tr("common.purchasing"), tr("common.materialReceipt")]}
      filters={
        <Select
          clearable
          data={SOURCE_OPTIONS}
          flex={isMobile ? 1 : undefined}
          onChange={setSource}
          placeholder={tr("purchase.materialReceipts.receiptType")}
          value={source}
          w={isMobile ? undefined : 150}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr(
            "purchase.materialReceipts.searchByMaterialCodeNameSupplier",
          )}
          value={search}
        />
      }
      title={tr("common.materialReceipt")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "receivedAt", dir: "desc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconPackageImport size={24} />}
        emptyMessage={tr(
          "purchase.materialReceipts.thereAreNoMaterialReceipts",
        )}
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack className="min-w-0" gap={3}>
              <Text c="dimmed" ff="mono" size="xs">
                {r.materialCode}
              </Text>
              <Text fw={600} size="sm" truncate>
                {r.materialName}
              </Text>
              <Text c="dimmed" size="xs" truncate>
                {r.supplierName ?? tr("purchase.materialReceipts.noSupplier")}
                {r.plantName ? ` / ${r.plantName}` : ""}
              </Text>
              <Group gap="md" mt={2}>
                <Text c="dimmed" size="xs">
                  {r.quantity} {r.unit}
                </Text>
              </Group>
            </Stack>
            <Stack align="flex-end" className="shrink-0" gap={4}>
              {r.poNumber ? (
                <Text c="dimmed" ff="mono" size="xs">
                  {r.poNumber}
                </Text>
              ) : (
                <Badge color="gray" variant="light">
                  {tr("common.directPurchase")}
                </Badge>
              )}
              <Text c="dimmed" size="xs">
                {fmt.date(r.receivedAt)}
              </Text>
            </Stack>
          </Group>
        )}
        urlState
      />
    </ListShell>
  );
}
