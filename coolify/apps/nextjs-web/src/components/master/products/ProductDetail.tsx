"use client";

/**
 * ProductDetail.tsx — 製品 詳細 (MS24, design.md §8.2).
 *
 * Ported from design-preview (designs/master/products/detail.tsx) and backed
 * by server data. 関連タブはこの製品の価格表エントリ。設計図・在庫・受注は
 * 各機能（design/inventory/production）導入時に追加する。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
 */

import {
  Anchor,
  Badge,
  Box,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import {
  IconCircleMinus,
  IconCopy,
  IconRuler2,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { KeywordBadges } from "@/components/master/MasterKeywordsField";
import { DesignRequestLinks } from "@/components/sales/design-requests/DesignRequestLinks";
import {
  DESIGN_FILE_ROLE_COLOR,
  DESIGN_FILE_ROLE_LABEL,
  type DesignRequestLink,
  type ProductDesignFile,
} from "@/components/sales/design-requests/model";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import {
  DesignFileThumb,
  DesignFileViewButton,
} from "@/components/ui/DesignFileViewer";
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
import { isViewable } from "@/lib/design-file-kind";
import type { RouteView } from "@/lib/product-routes-core";
import { isReservedSpecKey } from "@/lib/product-types";
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

const ORDER_TYPE_LABEL: Record<string, string> = {
  PRODUCTION: "本番",
  TEST: "テスト",
  SAMPLE: "サンプル",
  OTHER: "その他",
};

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
  /** この製品の設計図（版一覧）— 関連タブ。 */
  designFiles?: ProductDesignFile[];
  /** この製品に紐づく設計依頼 — 関連タブ。 */
  designRequests?: DesignRequestLink[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  // サムネイルに出す 1 件 — 3D プレビューがあればそれ、無ければ図面データ。
  const latestPreview =
    designFiles.find((f) => f.isLatest && f.role === "PREVIEW") ??
    designFiles.find((f) => f.isLatest && f.role === "BLUEPRINT");

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
              label: "設計依頼を起票",
              icon: <IconRuler2 size={14} />,
              onClick: () =>
                router.push(`/sales/design-requests/new?product=${record.id}`),
            },
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
      createdAt={fmt.dateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={fmt.dateTime(record.updatedAt)}
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
          <Tabs.Tab value="routes">工程</Tabs.Tab>
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
            <FieldValue
              label="キーワード"
              value={<KeywordBadges values={record.matchNames} />}
            />
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="routes">
          <ProductRoutesPanel productId={record.id} routes={routes} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="lg">
            {/* 設計図 — 差し替えは設計依頼 (SA06) の「完了」でのみ行う。
                版採番と is_latest の整合を 1 tx で守るため、ここは読むだけ。 */}
            <Stack gap="xs">
              <Text fw={600} size="sm">
                設計図
              </Text>
              {designFiles.length === 0 ? (
                <Text c="dimmed" size="sm">
                  この製品の設計図はまだありません
                </Text>
              ) : (
                <>
                  {/* 最新の主図面だけサムネイルで出す。押すと拡大。
                      版を全部サムネイルにすると 3D が何枚も WebGL を起こす。 */}
                  {latestPreview && (
                    <Box maw={320}>
                      <DesignFileThumb
                        target={{
                          caption: `v${latestPreview.version}（最新）`,
                          filename: latestPreview.filename,
                          mimeType: latestPreview.mimeType,
                          src: `/api/design-files/${encodeURIComponent(latestPreview.id)}`,
                        }}
                      />
                    </Box>
                  )}
                  <Table highlightOnHover striped withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={110}>バージョン</Table.Th>
                        <Table.Th>ファイル名</Table.Th>
                        {!isMobile && <Table.Th w={170}>元依頼</Table.Th>}
                        {!isMobile && <Table.Th w={150}>登録日時</Table.Th>}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {designFiles.map((f) => (
                        <Table.Tr key={f.id}>
                          <Table.Td className="tabular-nums">
                            <Group gap="xs" wrap="nowrap">
                              v{f.version}
                              <Badge
                                color={DESIGN_FILE_ROLE_COLOR[f.role] ?? "gray"}
                                variant="light"
                              >
                                {DESIGN_FILE_ROLE_LABEL[f.role] ?? f.role}
                              </Badge>
                              {f.isLatest && (
                                <Badge color="green" variant="light">
                                  最新
                                </Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs" wrap="nowrap">
                              <Anchor
                                href={`/api/design-files/${encodeURIComponent(f.id)}`}
                                size="sm"
                                target="_blank"
                              >
                                {f.filename}
                              </Anchor>
                              {isViewable(f.filename, f.mimeType) && (
                                <DesignFileViewButton
                                  target={{
                                    caption: `v${f.version}`,
                                    filename: f.filename,
                                    mimeType: f.mimeType,
                                    src: `/api/design-files/${encodeURIComponent(f.id)}`,
                                  }}
                                />
                              )}
                            </Group>
                          </Table.Td>
                          {!isMobile && (
                            <Table.Td>
                              {f.requestNumber ? (
                                <Anchor
                                  onClick={() =>
                                    router.push(
                                      `/sales/design-requests/${encodeURIComponent(f.requestNumber ?? "")}`,
                                    )
                                  }
                                  size="sm"
                                >
                                  {f.requestNumber}
                                </Anchor>
                              ) : (
                                <Text c="dimmed" size="sm">
                                  —
                                </Text>
                              )}
                            </Table.Td>
                          )}
                          {!isMobile && (
                            <Table.Td className="tabular-nums">
                              {fmt.dateTime(f.createdAt)}
                            </Table.Td>
                          )}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </>
              )}
            </Stack>

            <Stack gap="xs">
              <Text fw={600} size="sm">
                設計依頼
              </Text>
              <DesignRequestLinks
                createHref={`/sales/design-requests/new?product=${record.id}`}
                links={designRequests}
              />
            </Stack>

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
                        key={`${e.id}-${e.orderType}`}
                        onClick={() =>
                          router.push(`/sales/price-lists/${e.id}`)
                        }
                      >
                        <Table.Td>{e.customerName}</Table.Td>
                        <Table.Td>
                          <Badge color="gray" variant="light">
                            {ORDER_TYPE_LABEL[e.orderType] ?? e.orderType}
                          </Badge>
                        </Table.Td>
                        {!isMobile && (
                          <Table.Td>
                            {fmt.date(e.validFrom)} 〜{" "}
                            {e.validUntil ? fmt.date(e.validUntil) : "無期限"}
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
