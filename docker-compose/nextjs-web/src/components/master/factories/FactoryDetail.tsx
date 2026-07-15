"use client";

/**
 * FactoryDetail.tsx — 工場 詳細 (MS2B, design.md §8.2 / §13.6).
 *
 * サマリーグリッドに連絡先・住所を表示する。関連タブは工場別の在庫サマリ
 * （製品在庫・素材在庫の件数 + 直近更新 10 行、在庫詳細へリンク）を表示する。
 */

import {
  Anchor,
  Badge,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import {
  IconBoxSeam,
  IconCircleMinus,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
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
import { COUNTRY_LABEL } from "@/lib/enum-labels";
import { formatDate, formatDateTime } from "@/lib/format";
import { DeleteFactoryModal, ToggleFactoryActiveModal } from "./FactoryModals";

const BASE_PATH = "/master/factories";

export interface FactoryDetailData {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  nameKana: string;
  countryCode: string | null;
  postalCode: string;
  addressJa: string;
  addressEn: string;
  phone: string;
  email: string;
  contactPerson: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** 関連タブ: 工場の製品在庫 1 行（直近更新分の抜粋）。 */
export interface FactoryProductInventoryRef {
  id: string;
  productName: string;
  productCode: string | null;
  lotNumber: number | null;
  quantity: number;
  reservedQuantity: number;
  isSemiFinished: boolean;
  updatedAt: string;
}

/** 関連タブ: 工場の素材在庫 1 行（直近更新分の抜粋、Decimal → Number 済み）。 */
export interface FactoryMaterialInventoryRef {
  id: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  reservedQuantity: number;
  unit: string;
  updatedAt: string;
}

/** 関連タブ: 工場別在庫サマリ。 */
export interface FactoryInventorySummary {
  productCount: number;
  materialCount: number;
  products: FactoryProductInventoryRef[];
  materials: FactoryMaterialInventoryRef[];
}

export function FactoryDetail({
  record,
  auditEntries,
  inventory,
}: {
  record: FactoryDetailData;
  auditEntries: AuditEntry[];
  inventory: FactoryInventorySummary;
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
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
      breadcrumbs={["マスタ", { label: "工場", href: BASE_PATH }, record.code]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="工場コード"
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
        <FieldValue label="よみがな" value={record.nameKana || "—"} />
        <FieldValue
          label="国"
          value={
            record.countryCode
              ? (COUNTRY_LABEL[record.countryCode] ?? record.countryCode)
              : "—"
          }
        />
        <FieldValue label="郵便番号" value={record.postalCode || "—"} />
        <FieldValue label="住所（日本語）" value={record.addressJa || "—"} />
        <FieldValue label="住所（英語）" value={record.addressEn || "—"} />
        <FieldValue label="電話番号" value={record.phone || "—"} />
        <FieldValue label="メールアドレス" value={record.email || "—"} />
        <FieldValue label="担当者" value={record.contactPerson || "—"} />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="lg">
            {/* 製品在庫（工場別サマリ — 直近更新 10 行） */}
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconBoxSeam size={16} />
                  <Title order={5}>
                    製品在庫（{inventory.productCount} 件）
                  </Title>
                </Group>
                <Anchor
                  component={Link}
                  href="/production/inventory/products"
                  size="sm"
                >
                  製品在庫一覧へ
                </Anchor>
              </Group>
              {inventory.products.length === 0 ? (
                <Text c="dimmed" size="sm">
                  この工場の製品在庫はありません
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={560}>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>製品</Table.Th>
                        <Table.Th ta="right" w={90}>
                          ロット
                        </Table.Th>
                        <Table.Th ta="right" w={90}>
                          在庫数
                        </Table.Th>
                        <Table.Th ta="right" w={90}>
                          予約数
                        </Table.Th>
                        <Table.Th w={90}>区分</Table.Th>
                        <Table.Th w={110}>更新日</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {inventory.products.map((p) => (
                        <Table.Tr
                          key={p.id}
                          onClick={() =>
                            router.push(
                              `/production/inventory/products/${p.id}`,
                            )
                          }
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <Text size="sm">{p.productName}</Text>
                            {p.productCode && (
                              <Text c="dimmed" ff="mono" size="xs">
                                {p.productCode}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            {p.lotNumber ?? "—"}
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            {p.quantity.toLocaleString("ja-JP")}
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            {p.reservedQuantity.toLocaleString("ja-JP")}
                          </Table.Td>
                          <Table.Td>
                            {p.isSemiFinished ? (
                              <Badge color="orange" variant="light">
                                半製品
                              </Badge>
                            ) : (
                              <Badge color="gray" variant="light">
                                完成品
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td className="tabular-nums">
                            {formatDate(p.updatedAt)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Stack>

            {/* 素材在庫（工場別サマリ — 直近更新 10 行） */}
            <Stack gap="xs">
              <Group justify="space-between">
                <Group gap="xs">
                  <IconStack2 size={16} />
                  <Title order={5}>
                    素材在庫（{inventory.materialCount} 件）
                  </Title>
                </Group>
                <Anchor
                  component={Link}
                  href="/production/inventory/materials"
                  size="sm"
                >
                  素材在庫一覧へ
                </Anchor>
              </Group>
              {inventory.materials.length === 0 ? (
                <Text c="dimmed" size="sm">
                  この工場の素材在庫はありません
                </Text>
              ) : (
                <Table.ScrollContainer minWidth={560}>
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>素材</Table.Th>
                        <Table.Th ta="right" w={110}>
                          在庫数
                        </Table.Th>
                        <Table.Th ta="right" w={90}>
                          予約数
                        </Table.Th>
                        <Table.Th w={110}>更新日</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {inventory.materials.map((m) => (
                        <Table.Tr
                          key={m.id}
                          onClick={() =>
                            router.push(
                              `/production/inventory/materials/${m.id}`,
                            )
                          }
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            <Text ff="mono" size="sm">
                              {m.materialCode}
                            </Text>
                            <Text c="dimmed" size="xs">
                              {m.materialName}
                            </Text>
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            {m.quantity.toLocaleString("ja-JP")} {m.unit}
                          </Table.Td>
                          <Table.Td className="tabular-nums" ta="right">
                            {m.reservedQuantity.toLocaleString("ja-JP")}
                          </Table.Td>
                          <Table.Td className="tabular-nums">
                            {formatDate(m.updatedAt)}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeleteFactoryModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleFactoryActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
