"use client";

/**
 * ProductDetail.tsx — 製品 詳細 (MS24, design.md §8.2).
 *
 * Ported from design-preview (designs/master/products/detail.tsx) and backed
 * by server data. 関連タブはこの製品の価格表エントリ。設計図・在庫・受注は
 * 各機能（design/inventory/production）導入時に追加する。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
 */

import { Badge, Stack, Table, Tabs, Text } from "@mantine/core";
import {
  IconCircleMinus,
  IconCopy,
  IconRuler2,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { KeywordBadges } from "@/components/master/MasterKeywordsField";
import type { ProductDesignFile } from "@/components/production/design-files/model";
import { DesignRequestLinks } from "@/components/sales/design-requests/DesignRequestLinks";
import type { DesignRequestLink } from "@/components/sales/design-requests/model";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { AppTabs } from "@/components/ui/AppTabs";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { orderTypeLabel } from "@/lib/enum-labels";
import type { RouteView } from "@/lib/product-routes-core";
import { isReservedSpecKey } from "@/lib/product-types";
import { ProductDesignFiles } from "./ProductDesignFiles";
import {
  DeleteProductModal,
  DuplicateProductModal,
  ToggleProductActiveModal,
} from "./ProductModals";
import { ProductRoutesPanel } from "./ProductRoutesPanel";

const BASE_PATH = "/master/products";

export interface ProductDetailData {
  id: number;
  code: string | null;
  nameJa: string;
  nameEn: string;
  /** 素材仕様 = 材種 + 直径 + 全長（特定素材には紐付けない）。 */
  materialTypeId: string | null;
  materialTypeCode: string | null;
  materialTypeName: string;
  diameterMm: number | null;
  lengthMm: number | null;
  unit: string;
  /** 検索・AI 突合用のキーワード（match_names）。 */
  matchNames: string[];
  isActive: boolean;
  notes: string;
  spec: { key: string; value: string }[];
  /** 製品種別（SY04）名。spec の予約キー `_product_type` から解決。 */
  productTypeName?: string | null;
  createdAt: string;
  updatedAt: string;
  priceListEntries: {
    id: string;
    customerName: string;
    orderType: string;
    validFrom: string;
    validUntil: string | null;
    isActive: boolean;
  }[];
}

export function ProductDetail({
  record,
  auditEntries,
  routes,
  designFiles = [],
  designRequests = [],
}: {
  record: ProductDetailData;
  auditEntries: AuditEntry[];
  /** 工程リスト（ルート）— 工程タブ。 */
  routes: RouteView[];
  /**
   * この製品の設計図（版一覧）— 関連タブ。**表示だけ**で、登録・編集・削除は
   * 設計図 (PD06) が持つ。
   */
  designFiles?: ProductDesignFile[];
  /** この製品に紐づく設計依頼 — 関連タブ。 */
  designRequests?: DesignRequestLink[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  // サムネイルに出す 1 件 — 3D プレビューがあればそれ、無ければ図面データ。

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const materialTypeLabel = record.materialTypeId
    ? `${record.materialTypeCode ?? ""}${record.materialTypeName ? ` — ${record.materialTypeName}` : ""}`
    : "";

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
    materialTypeId: record.materialTypeId,
    materialTypeLabel,
    diameterMm: record.diameterMm,
    lengthMm: record.lengthMm,
    unit: record.unit,
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            // 設計図を差し替える唯一の入口。マスタ側で直接置き換えさせない
            // （版と is_latest の整合は設計依頼の完了が 1 tx で守っている）。
            {
              label: tr("common.raiseADesignRequest"),
              icon: <IconRuler2 size={14} />,
              onClick: () =>
                router.push(`/sales/design-requests/new?product=${record.id}`),
            },
            {
              label: tr("common.duplicate"),
              icon: <IconCopy size={14} />,
              onClick: () => setDuplicateOpen(true),
            },
            {
              label: record.isActive
                ? tr("common.disable")
                : tr("common.enable"),
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: tr("common.delete"),
              icon: <IconTrash size={14} />,
              color: "red",
              divider: true,
              onClick: () => setDeleteOpen(true),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${record.id}/edit`)}
        />
      }
      breadcrumbs={[
        tr("common.masterData"),
        { label: tr("master.productTable.pageTitle"), href: BASE_PATH },
        record.code ?? record.nameJa,
      ]}
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.productCode")}
          value={
            <DocNumber>{record.code ?? tr("common.notNumbered")}</DocNumber>
          }
        />
        <FieldValue label={tr("common.nameJapanese")} value={record.nameJa} />
        <FieldValue
          label={tr("common.nameEnglish")}
          value={record.nameEn || "—"}
        />
        <FieldValue
          label={tr("common.materialTypes")}
          value={
            record.materialTypeId ? (
              <DocNumber c="blue">{materialTypeLabel}</DocNumber>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label={tr("common.diameter")}
          value={record.diameterMm != null ? `φ${record.diameterMm} mm` : "—"}
        />
        <FieldValue
          label={tr("common.overallLength")}
          value={record.lengthMm != null ? `${record.lengthMm} mm` : "—"}
        />
        <FieldValue label={tr("common.unit")} value={record.unit} />
      </SummaryGrid>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="routes">
            {tr("master.productDetail.routesTab")}
          </Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {record.productTypeName && (
              <FieldValue
                label={tr("common.productTypes")}
                value={record.productTypeName}
              />
            )}
            <Stack gap="xs">
              <Text fw={600} size="sm">
                {tr("master.products.specification")}
              </Text>
              {(() => {
                const specRows = record.spec.filter(
                  (s) => !isReservedSpecKey(s.key),
                );
                return specRows.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    {tr("master.products.noSpecificationIsRegistered")}
                  </Text>
                ) : (
                  <Table striped withTableBorder>
                    <Table.Tbody>
                      {specRows.map((s) => (
                        <Table.Tr key={s.key}>
                          <Table.Th w={isMobile ? 120 : 200}>{s.key}</Table.Th>
                          <Table.Td>{s.value}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                );
              })()}
            </Stack>
            <FieldValue
              label={tr("common.keywords")}
              value={<KeywordBadges values={record.matchNames} />}
            />
            <FieldValue
              label={tr("common.notes")}
              value={record.notes || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="routes">
          <ProductRoutesPanel productId={record.id} routes={routes} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="lg">
            {/* 設計図 — 系列（製品 × 受注元）ごとに分けて出す（読み取り専用。
                登録・編集は 設計図 PD06）。版の差し替えは「新しい版を作る」
                操作だけで、過去の版は書き換えない（何を見て作ったかを
                追えるようにするため）。 */}
            <ProductDesignFiles files={designFiles} productId={record.id} />

            <Stack gap="xs">
              <Text fw={600} size="sm">
                {tr("common.designRequest")}
              </Text>
              <DesignRequestLinks
                createHref={`/sales/design-requests/new?product=${record.id}`}
                links={designRequests}
              />
            </Stack>

            <Stack gap="xs">
              <Text fw={600} size="sm">
                {tr("master.products.priceListEntry")}
              </Text>
              {record.priceListEntries.length === 0 ? (
                <Text c="dimmed" size="sm">
                  {tr("master.products.thereAreNoPriceListEntries")}
                </Text>
              ) : (
                <Table highlightOnHover striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{tr("common.customer")}</Table.Th>
                      <Table.Th>{tr("common.orderType")}</Table.Th>
                      {!isMobile && (
                        <Table.Th>{tr("common.validPeriod")}</Table.Th>
                      )}
                      <Table.Th>{tr("common.status")}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.priceListEntries.map((e) => (
                      <Table.Tr
                        className="cursor-pointer"
                        key={`${e.id}-${e.orderType}`}
                        onClick={() =>
                          router.push(`/sales/price-lists/${e.id}`)
                        }
                      >
                        <Table.Td>{e.customerName}</Table.Td>
                        <Table.Td>
                          <Badge color="gray" variant="light">
                            {orderTypeLabel(e.orderType, locale)}
                          </Badge>
                        </Table.Td>
                        {!isMobile && (
                          <Table.Td>
                            {fmt.date(e.validFrom)} 〜{" "}
                            {e.validUntil
                              ? fmt.date(e.validUntil)
                              : tr("common.noEndDate")}
                          </Table.Td>
                        )}
                        <Table.Td>
                          <ActiveBadge active={e.isActive} />
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <DeleteProductModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <DuplicateProductModal
        onClose={() => setDuplicateOpen(false)}
        opened={duplicateOpen}
        source={target}
      />
      <ToggleProductActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
