"use client";

/**
 * PriceListTable — 価格表 一覧 (design.md §8.1 / §14).
 *
 * One row per (顧客, 製品, 注文種別) entry — 本番・テスト など注文種別ごとに行を
 * 分ける。Row click → the entry's detail page. Rows come from
 * sales.price_list_entries via the server page; bulk 有効化/無効化/削除 persist
 * through Server Actions.
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCalculator,
  IconCopy,
  IconCopyPlus,
  IconCurrencyYen,
  IconFileText,
  IconSearch,
  IconToggleRight,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deletePriceEntries,
  setPriceEntriesActive,
} from "@/app/(dashboard)/sales/price-lists/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS } from "@/lib/mock";
import { CopyPriceListModal } from "./CopyPriceListModal";
import { CreateQuoteModal } from "./CreateQuoteModal";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
  entryKeyParts,
  entrySummary,
  type PriceListEntry,
  priceRangeLabel,
  validPeriod,
} from "./model";

const BASE_PATH = "/sales/price-lists";

export function PriceListTable({
  entries,
  customerOptions,
  productOptions,
}: {
  entries: PriceListEntry[];
  customerOptions: Option[];
  productOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<string | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<string | null>(null);

  // Modal targets (null = closed).
  const [deleteTarget, setDeleteTarget] = useState<PriceListEntry | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<PriceListEntry | null>(
    null,
  );
  const [copyTarget, setCopyTarget] = useState<PriceListEntry | null>(null);
  const [quoteTarget, setQuoteTarget] = useState<PriceListEntry | null>(null);

  const bulkSetActive = (rows: PriceListEntry[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setPriceEntriesActive(
        rows.map(entryKeyParts),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${rows.length}件の価格表を${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (rows: PriceListEntry[]) => {
    openConfirm({
      title: "価格表の一括削除",
      message: `選択中の${rows.length}件の価格表（段階・値引きルール含む）を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deletePriceEntries(rows.map(entryKeyParts));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${rows.length}件の価格表を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  const reset = () => {
    setSearch("");
    setCustomer(null);
    setProduct(null);
    setOrderType(null);
  };

  const filtered = entries.filter((e) => {
    const matchesSearch =
      !search ||
      e.customerName.includes(search) ||
      e.productName.includes(search);
    const matchesCustomer = !customer || e.customerId === customer;
    const matchesProduct = !product || e.productId === product;
    const matchesType = !orderType || e.orderType === orderType;
    return matchesSearch && matchesCustomer && matchesProduct && matchesType;
  });

  const columns: Column<PriceListEntry>[] = [
    {
      key: "customerName",
      header: "顧客",
      sortable: true,
      render: (e) => e.customerName,
    },
    {
      key: "productName",
      header: "製品",
      sortable: true,
      render: (e) => e.productName,
    },
    {
      key: "orderType",
      header: "注文種別",
      sortable: true,
      width: 120,
      render: (e) => (
        <Badge color="gray" variant="light">
          {ORDER_TYPE_LABEL[e.orderType]}
        </Badge>
      ),
    },
    {
      key: "tiers",
      header: "段階",
      width: 80,
      sortValue: (e) => entrySummary(e).tierCount,
      render: (e) => `${entrySummary(e).tierCount}段階`,
    },
    {
      key: "price",
      header: "単価",
      align: "right",
      width: 160,
      sortValue: (e) => entrySummary(e).minPrice,
      render: (e) => {
        const s = entrySummary(e);
        return (
          <Text className="tabular-nums" ff="mono" size="sm" ta="right">
            {priceRangeLabel(s.minPrice, s.maxPrice)}
          </Text>
        );
      },
    },
    {
      key: "discounts",
      header: "値引き",
      hideable: true,
      width: 90,
      sortValue: (e) => e.discounts.filter((d) => d.isActive).length,
      render: (e) => {
        const active = e.discounts.filter((d) => d.isActive).length;
        return active > 0 ? (
          <Badge color="pink" size="xs" variant="light">
            {active}件
          </Badge>
        ) : (
          <Text c="dimmed" size="xs">
            —
          </Text>
        );
      },
    },
    {
      key: "estimateNumber",
      header: "試算元",
      hideable: true,
      width: 160,
      sortValue: (e) => e.estimateNumber ?? "",
      render: (e) =>
        e.estimateId ? (
          <DocNumber c="blue">{e.estimateNumber}</DocNumber>
        ) : (
          <Text c="dimmed" size="xs">
            手動
          </Text>
        ),
    },
    {
      key: "validPeriod",
      header: "有効期間",
      hideable: true,
      width: 200,
      sortValue: (e) => e.validFrom,
      render: (e) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {validPeriod(e.validFrom, e.validUntil)}
        </Text>
      ),
    },
    {
      key: "isActive",
      header: "状態",
      width: 90,
      sortValue: (e) => (e.isActive ? 1 : 0),
      render: (e) => <ActiveBadge active={e.isActive} />,
    },
  ];

  return (
    <ListShell
      action={
        // 価格表は試算の「価格表に登録」からのみ作成する。
        <SecondaryButton
          href="/sales/trial-estimates"
          leftSection={<IconCalculator size={16} />}
        >
          試算から作成
        </SecondaryButton>
      }
      breadcrumbs={["販売", "価格表"]}
      filters={
        <>
          <Select
            clearable
            data={customerOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setCustomer}
            placeholder="顧客"
            searchable
            value={customer}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={productOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setProduct}
            placeholder="製品"
            searchable
            value={product}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={ORDER_TYPE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setOrderType}
            placeholder="注文種別"
            value={orderType}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="顧客・製品で検索"
          value={search}
        />
      }
      title="価格表"
    >
      <DataTable
        bulkActions={[
          {
            label: "有効化",
            icon: <IconToggleRight size={16} />,
            color: "green",
            onAction: (rows) => bulkSetActive(rows, true),
          },
          {
            label: "無効化",
            icon: <IconToggleRight size={16} />,
            color: "gray",
            onAction: (rows) => bulkSetActive(rows, false),
          },
          {
            label: "一括削除",
            icon: <IconTrash size={16} />,
            color: "red",
            onAction: bulkDelete,
          },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "customerName", dir: "asc" }}
        emptyAction={
          <SecondaryButton
            href="/sales/trial-estimates"
            leftSection={<IconCalculator size={16} />}
          >
            試算から作成
          </SecondaryButton>
        }
        emptyIcon={<IconCurrencyYen size={24} />}
        emptyMessage="価格表がありません — 試算の「価格表に登録」から作成します"
        getRowId={(e) => e.entryId}
        onRowClick={(e) => router.push(`${BASE_PATH}/${e.entryId}`)}
        renderCard={(e) => {
          const s = entrySummary(e);
          return (
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack className="min-w-0" gap={3}>
                <Text fw={600} size="sm" truncate>
                  {e.customerName}
                </Text>
                <Text c="dimmed" size="xs" truncate>
                  {e.productName}
                </Text>
                <Group gap="xs">
                  <Badge color="gray" size="xs" variant="light">
                    {ORDER_TYPE_LABEL[e.orderType]}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {s.tierCount}段階
                  </Text>
                </Group>
              </Stack>
              <Stack align="flex-end" className="shrink-0" gap={4}>
                <Text className="tabular-nums" ff="mono" size="sm">
                  {priceRangeLabel(s.minPrice, s.maxPrice)}
                </Text>
                <ActiveBadge active={e.isActive} />
              </Stack>
            </Group>
          );
        }}
        rowActions={(e) => [
          {
            label: "見積書を作成",
            icon: <IconFileText size={14} />,
            onAction: () => setQuoteTarget(e),
          },
          {
            label: "有効期間を変えて複製",
            icon: <IconCopy size={14} />,
            onAction: () => setDuplicateTarget(e),
          },
          {
            label: "別の顧客・製品へコピー",
            icon: <IconCopyPlus size={14} />,
            onAction: () => setCopyTarget(e),
          },
          {
            label: "削除",
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: () => setDeleteTarget(e),
          },
        ]}
        selectable
      />

      <DeletePriceListModal
        onClose={() => setDeleteTarget(null)}
        onDone={() => router.refresh()}
        opened={deleteTarget !== null}
        target={deleteTarget}
      />
      <DuplicatePriceListModal
        onClose={() => setDuplicateTarget(null)}
        opened={duplicateTarget !== null}
        source={duplicateTarget}
      />
      <CopyPriceListModal
        customerOptions={customerOptions}
        onClose={() => setCopyTarget(null)}
        opened={copyTarget !== null}
        productOptions={productOptions}
        source={copyTarget}
      />
      <CreateQuoteModal
        onClose={() => setQuoteTarget(null)}
        opened={quoteTarget !== null}
        source={quoteTarget}
      />
    </ListShell>
  );
}
