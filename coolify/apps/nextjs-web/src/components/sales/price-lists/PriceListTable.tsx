"use client";

/**
 * PriceListTable — 価格表 一覧 (design.md §8.1 / §14).
 *
 * One row per (顧客, 製品) entry — 注文種別ごとの価格はエントリ内のバリアント
 * （バッジ表示）。Row click → the entry's detail page. Rows come from
 * sales.price_list_entries via the server page; bulk 有効化/無効化/削除 persist
 * through Server Actions.
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconCopyPlus,
  IconCurrencyYen,
  IconFileText,
  IconSearch,
  IconToggleRight,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  deletePriceEntries,
  setPriceEntriesActive,
} from "@/app/(dashboard)/sales/price-lists/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { CreateButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { WithDocCompany } from "@/components/ui/DocCompanyBadge";
import { DocNumber } from "@/components/ui/DocNumber";
import { MoneyText } from "@/components/ui/MoneyText";
import { openConfirm } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { matchesDocCompany } from "@/lib/doc-company-view-core";
import type { Option } from "@/lib/mock";
import { ORDER_TYPE_LABEL, ORDER_TYPE_OPTIONS } from "@/lib/mock";
import { CopyPriceListModal } from "./CopyPriceListModal";
import { CreateQuoteModal } from "./CreateQuoteModal";
import { companySyncState } from "./company-sync";
import { DeletePriceListModal } from "./DeletePriceListModal";
import { DuplicatePriceListModal } from "./DuplicatePriceListModal";
import {
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
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [, startTransition] = useTransition();
  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [customer, setCustomer] = useUrlSelectState("customer");
  const [product, setProduct] = useUrlSelectState("product");
  const [orderType, setOrderType] = useUrlSelectState("orderType");
  const [company, setCompany] = useUrlSelectState("company");

  // 発行会社 — 価格表は会社ごとに別々。2 社以上の価格表が見える人にだけ
  // 発行会社の絞り込みと他社との突き合わせ列を出す（1 社だけなら毎行同じ値が
  // 並ぶだけ）。行ごとの発行会社は顧客名の隣のバッジ（DocCompanyBadge — 全書類
  // 共通の出し方）。
  const companyOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of entries) {
      if (!seen.has(e.ownCompanyId))
        seen.set(
          e.ownCompanyId,
          e.ownCompanyName !== e.ownCompanyCode
            ? `${e.ownCompanyCode} ${e.ownCompanyName}`
            : e.ownCompanyCode,
        );
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value: String(value), label }));
  }, [entries]);
  const multiCompany = companyOptions.length > 1;
  // 他社の価格表（同じ顧客 × 品目 × 工具）と中身が同じか — 行ごとに 1 回だけ数える。
  const syncByEntry = useMemo(
    () =>
      new Map(entries.map((e) => [e.entryId, companySyncState(e, entries)])),
    [entries],
  );

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
        rows.map((r) => r.entryId),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: tr("sales.priceListTable.bulkActiveChangedMessage", {
            count: rows.length,
            action: isActive ? tr("common.enable") : tr("common.disable"),
          }),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (rows: PriceListEntry[]) => {
    openConfirm({
      title: tr("sales.priceLists.bulkDeletePriceLists"),
      message: tr("sales.priceListTable.confirmBulkDeleteMessage", {
        count: rows.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deletePriceEntries(rows.map((r) => r.entryId));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("sales.priceListTable.bulkDeletedMessage", {
                count: rows.length,
              }),
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  const reset = () => {
    setSearch(null);
    setCustomer(null);
    setProduct(null);
    setOrderType(null);
    setCompany(null);
  };

  const filtered = entries.filter((e) => {
    const matchesSearch =
      !search ||
      matchesDocCompany(e.ownCompanyCode, search) ||
      e.customerName.includes(search) ||
      e.productName.includes(search) ||
      (e.toolName ?? "").includes(search);
    const matchesCustomer = !customer || e.customerId === customer;
    const matchesProduct = !product || e.itemId === product;
    const matchesType =
      !orderType || e.variants.some((v) => v.orderType === orderType);
    const matchesCompany = !company || String(e.ownCompanyId) === company;
    return (
      matchesSearch &&
      matchesCustomer &&
      matchesProduct &&
      matchesType &&
      matchesCompany
    );
  });

  const columns: Column<PriceListEntry>[] = [
    ...(multiCompany
      ? [
          {
            // 他社の価格表（同じ顧客 × 品目 × 工具・別の発行会社）との突き合わせ。
            // 相手方が無ければ空。差分は詳細画面で見て、そこで同期する。
            key: "companySync",
            header: tr("sales.priceListCompanySync.column"),
            width: 110,
            hideable: true,
            sortValue: (e: PriceListEntry) => {
              const st = syncByEntry.get(e.entryId);
              return st === "diff" ? 2 : st === "same" ? 1 : 0;
            },
            render: (e: PriceListEntry) => {
              const st = syncByEntry.get(e.entryId);
              if (!st) return null;
              return (
                <Badge
                  color={st === "same" ? "green" : "orange"}
                  size="xs"
                  variant="light"
                >
                  {st === "same"
                    ? tr("sales.priceListCompanySync.same")
                    : tr("sales.priceListCompanySync.differs")}
                </Badge>
              );
            },
          },
        ]
      : []),
    {
      key: "customerName",
      header: tr("common.customer"),
      sortable: true,
      // 価格表は番号の列を持たないので、発行会社のバッジは顧客名に添える。
      render: (e) => (
        <WithDocCompany company={e.ownCompanyCode}>
          <Text size="sm" truncate>
            {e.customerName}
          </Text>
        </WithDocCompany>
      ),
    },
    {
      key: "productName",
      header: tr("common.product"),
      sortable: true,
      // 既定幅（160px）だと、印 + 品名 + 対象工具の 2 行が入りきらず、印は潰れて
      // 色の四角だけになり、工具名は途中で切れる。同じ再研磨品目のサイズ帯違い・
      // 工具違いが並んだときに見分けが付かないので、幅を取り、入りきらない名前は
      // 切らずに折り返す（見分ける語は名前の後ろ側にある）。
      width: 280,
      truncate: false,
      // 製品と再研磨品目が同じ列に並ぶので、行がどちらかを言う。名前だけだと
      // 「工具の名前」と「研ぎ直しという役務の名前」が見分けられない。
      render: (e) => (
        <Group gap={6} wrap="nowrap">
          {e.itemType === "REGRIND" && (
            <Badge
              color="orange"
              size="xs"
              style={{ flexShrink: 0 }}
              variant="light"
            >
              {tr("enum.ITEM_TYPE_LABEL.REGRIND")}
            </Badge>
          )}
          <Stack gap={0} miw={0}>
            <Text size="sm" style={{ overflowWrap: "anywhere" }}>
              {e.productName}
            </Text>
            {/* 対象工具 — 工具ごとの再研磨価格だけが持つ。工具なしは出さない。 */}
            {e.toolName && (
              <Text c="dimmed" size="xs" style={{ overflowWrap: "anywhere" }}>
                {tr("sales.priceLists.targetTool")}: {e.toolName}
              </Text>
            )}
          </Stack>
        </Group>
      ),
    },
    {
      // 標準価格は**読むだけ**（持ち主は品目マスタ）。当たる価格表が無いときに
      // いくらで売れるのかが、価格表の画面から見えないと分からないため出す。
      key: "standardUnitPrice",
      header: tr("common.standardPrice"),
      width: 120,
      align: "right" as const,
      hideable: true,
      sortValue: (e) => e.standardUnitPrice ?? -1,
      render: (e) =>
        e.standardUnitPrice == null ? (
          <Text c="dimmed" size="xs">
            —
          </Text>
        ) : (
          <MoneyText value={e.standardUnitPrice} />
        ),
    },
    {
      key: "orderType",
      header: tr("common.orderType"),
      width: 160,
      sortValue: (e) => e.variants.length,
      render: (e) => (
        <Group gap={4} wrap="wrap">
          {e.variants.map((v) => (
            <Badge color="gray" key={v.id} size="xs" variant="light">
              {ORDER_TYPE_LABEL[v.orderType] ?? v.orderType}
            </Badge>
          ))}
        </Group>
      ),
    },
    {
      key: "tiers",
      header: tr("common.tier"),
      width: 80,
      sortValue: (e) => entrySummary(e).tierCount,
      render: (e) =>
        tr("sales.priceListTable.tierCountLabel", {
          count: entrySummary(e).tierCount,
        }),
    },
    {
      key: "price",
      header: tr("common.unitPrice"),
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
      header: tr("common.discount"),
      hideable: true,
      width: 90,
      sortValue: (e) =>
        e.variants.reduce(
          (sum, v) => sum + v.discounts.filter((d) => d.isActive).length,
          0,
        ),
      render: (e) => {
        const active = e.variants.reduce(
          (sum, v) => sum + v.discounts.filter((d) => d.isActive).length,
          0,
        );
        return active > 0 ? (
          <Badge color="pink" size="xs" variant="light">
            {tr("sales.priceListTable.itemCountNoSpace", { count: active })}
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
      header: tr("common.priceEstimateSource"),
      hideable: true,
      width: 160,
      sortValue: (e) =>
        e.variants.find((v) => v.estimateNumber)?.estimateNumber ?? "",
      render: (e) => {
        const linked = e.variants.filter((v) => v.estimateNumber);
        if (linked.length === 0) {
          return (
            <Text c="dimmed" size="xs">
              {tr("common.manual")}
            </Text>
          );
        }
        return (
          <Group gap={4} wrap="nowrap">
            <DocNumber c="blue">{linked[0].estimateNumber}</DocNumber>
            {linked.length > 1 && (
              <Badge color="gray" size="xs" variant="light">
                +{linked.length - 1}
              </Badge>
            )}
          </Group>
        );
      },
    },
    {
      key: "validPeriod",
      header: tr("common.validPeriod"),
      hideable: true,
      width: 200,
      sortValue: (e) => e.variants[0]?.validFrom ?? "",
      render: (e) =>
        e.variants.length === 1 ? (
          <Text c="dimmed" className="tabular-nums" size="xs">
            {validPeriod(
              fmt,
              e.variants[0].validFrom,
              e.variants[0].validUntil,
              tr,
            )}
          </Text>
        ) : (
          <Text c="dimmed" size="xs">
            {tr("sales.priceLists.setPerType")}
          </Text>
        ),
    },
    {
      key: "isActive",
      header: tr("common.status"),
      width: 90,
      sortValue: (e) => (e.isActive ? 1 : 0),
      render: (e) => <EntryStatusBadges entry={e} />,
    },
  ];

  return (
    <ListShell
      action={<CreateButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.sales"), tr("common.priceList")]}
      filters={
        <>
          {multiCompany && (
            <Select
              aria-label={tr("common.issuingCompany")}
              clearable
              data={companyOptions}
              flex={isMobile ? 1 : undefined}
              onChange={setCompany}
              placeholder={tr("sales.priceListCompanySync.allCompanies")}
              value={company}
              w={isMobile ? undefined : 160}
            />
          )}
          <Select
            aria-label={tr("common.customer")}
            clearable
            data={customerOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setCustomer}
            placeholder={tr("common.customer")}
            searchable
            value={customer}
            w={isMobile ? undefined : 180}
          />
          <Select
            aria-label={tr("common.product")}
            clearable
            data={productOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setProduct}
            placeholder={tr("common.product")}
            searchable
            value={product}
            w={isMobile ? undefined : 180}
          />
          <Select
            aria-label={tr("common.orderType")}
            clearable
            data={ORDER_TYPE_OPTIONS}
            flex={isMobile ? 1 : undefined}
            onChange={setOrderType}
            placeholder={tr("common.orderType")}
            value={orderType}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("sales.priceLists.searchByCustomerOrProduct")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("sales.priceLists.searchByCustomerOrProduct")}
          value={search}
        />
      }
      title={tr("common.priceList")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("common.enable"),
            icon: <IconToggleRight size={16} />,
            color: "green",
            onAction: (rows) => bulkSetActive(rows, true),
          },
          {
            label: tr("common.disable"),
            icon: <IconToggleRight size={16} />,
            color: "gray",
            onAction: (rows) => bulkSetActive(rows, false),
          },
          {
            label: tr("common.bulkDelete"),
            icon: <IconTrash size={16} />,
            color: "red",
            onAction: bulkDelete,
          },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "customerName", dir: "asc" }}
        emptyAction={<CreateButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconCurrencyYen size={24} />}
        emptyMessage={tr("sales.priceLists.thereIsNoPriceListPick")}
        getRowId={(e) => e.entryId}
        onRowClick={(e) => router.push(`${BASE_PATH}/${e.entryId}`)}
        renderCard={(e) => {
          const s = entrySummary(e);
          return (
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack className="min-w-0" gap={3}>
                <WithDocCompany company={e.ownCompanyCode}>
                  <Text fw={600} size="sm" truncate>
                    {e.customerName}
                  </Text>
                </WithDocCompany>
                <Text c="dimmed" size="xs" truncate>
                  {e.productName}
                </Text>
                {e.toolName && (
                  <Text c="dimmed" size="xs" truncate>
                    {tr("sales.priceLists.targetTool")}: {e.toolName}
                  </Text>
                )}
                <Group gap="xs">
                  {e.variants.map((v) => (
                    <Badge color="gray" key={v.id} size="xs" variant="light">
                      {ORDER_TYPE_LABEL[v.orderType] ?? v.orderType}
                    </Badge>
                  ))}
                  <Text c="dimmed" size="xs">
                    {tr("sales.priceListTable.tierCountLabel", {
                      count: s.tierCount,
                    })}
                  </Text>
                </Group>
              </Stack>
              <Stack align="flex-end" className="shrink-0" gap={4}>
                <Text className="tabular-nums" ff="mono" size="sm">
                  {priceRangeLabel(s.minPrice, s.maxPrice)}
                </Text>
                <EntryStatusBadges entry={e} />
              </Stack>
            </Group>
          );
        }}
        rowActions={(e) => [
          {
            label: tr("common.createAQuote"),
            icon: <IconFileText size={14} />,
            onAction: () => setQuoteTarget(e),
          },
          {
            label: tr("sales.priceLists.duplicateWithADifferentValidPeriod"),
            icon: <IconCopy size={14} />,
            onAction: () => setDuplicateTarget(e),
          },
          {
            label: tr("common.copyToAnotherCustomerOrProduct"),
            icon: <IconCopyPlus size={14} />,
            onAction: () => setCopyTarget(e),
          },
          {
            label: tr("common.delete"),
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: () => setDeleteTarget(e),
          },
        ]}
        selectable
        urlState
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

/**
 * 有効 / 無効 + 独自値の追加承認の状態。承認待ち・差し戻しの価格表は価格の
 * 解決に使われないので、一覧でもそれと分かるようにする。
 */
function EntryStatusBadges({ entry }: { entry: PriceListEntry }) {
  const pending =
    entry.approvalStatus === "PENDING" || entry.approvalStatus === "REJECTED";
  return (
    <Group gap={4} wrap="nowrap">
      <ActiveBadge active={entry.isActive} />
      {pending && entry.approvalStatus && (
        <StatusBadge entity="PriceListApproval" status={entry.approvalStatus} />
      )}
    </Group>
  );
}
