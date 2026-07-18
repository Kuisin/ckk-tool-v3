"use client";

/**
 * ProductDetail.tsx — 製品 詳細 (MS23, design.md §8.2).
 *
 * Ported from design-preview (designs/master/products/detail.tsx) and backed
 * by server data. 関連タブはこの製品の価格表エントリ。設計図・在庫・受注は
 * 各機能（design/inventory/production）導入時に追加する。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
 */

import { Badge, Stack, Table, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconCopy, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
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
import { formatDate, formatDateTime } from "@/lib/format";
import { isReservedSpecKey } from "@/lib/product-types";
import {
  DeleteProductModal,
  DuplicateProductModal,
  ToggleProductActiveModal,
} from "./ProductModals";

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

const ORDER_TYPE_LABEL: Record<string, string> = {
  PRODUCTION: "本番",
  TEST: "テスト",
  SAMPLE: "サンプル",
  OTHER: "その他",
};

export function ProductDetail({
  record,
  auditEntries,
}: {
  record: ProductDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

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
            {
              label: "複製",
              icon: <IconCopy size={14} />,
              onClick: () => setDuplicateOpen(true),
            },
            {
              label: record.isActive ? "無効化" : "有効化",
              icon: <IconCircleMinus size={14} />,
              onClick: () => setToggleOpen(true),
            },
            {
              label: "削除",
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
        "マスタ",
        { label: "製品", href: BASE_PATH },
        record.code ?? record.nameJa,
      ]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="製品コード"
          value={<DocNumber>{record.code ?? "未採番"}</DocNumber>}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
        <FieldValue
          label="材種"
          value={
            record.materialTypeId ? (
              <DocNumber c="blue">{materialTypeLabel}</DocNumber>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label="直径"
          value={record.diameterMm != null ? `φ${record.diameterMm} mm` : "—"}
        />
        <FieldValue
          label="全長"
          value={record.lengthMm != null ? `${record.lengthMm} mm` : "—"}
        />
        <FieldValue label="単位" value={record.unit} />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {record.productTypeName && (
              <FieldValue label="製品種別" value={record.productTypeName} />
            )}
            <Stack gap="xs">
              <Text fw={600} size="sm">
                仕様
              </Text>
              {(() => {
                const specRows = record.spec.filter(
                  (s) => !isReservedSpecKey(s.key),
                );
                return specRows.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    仕様は登録されていません
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
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              価格表エントリ
            </Text>
            {record.priceListEntries.length === 0 ? (
              <Text c="dimmed" size="sm">
                この製品の価格表エントリはありません
              </Text>
            ) : (
              <Table highlightOnHover striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>顧客</Table.Th>
                    <Table.Th>注文種別</Table.Th>
                    {!isMobile && <Table.Th>有効期間</Table.Th>}
                    <Table.Th>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {record.priceListEntries.map((e) => (
                    <Table.Tr
                      className="cursor-pointer"
                      key={e.id}
                      onClick={() => router.push(`/sales/price-lists/${e.id}`)}
                    >
                      <Table.Td>{e.customerName}</Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="light">
                          {ORDER_TYPE_LABEL[e.orderType] ?? e.orderType}
                        </Badge>
                      </Table.Td>
                      {!isMobile && (
                        <Table.Td>
                          {formatDate(e.validFrom)} 〜{" "}
                          {e.validUntil ? formatDate(e.validUntil) : "無期限"}
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
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

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
