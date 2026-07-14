"use client";

/**
 * InspectionTemplateDetail.tsx — 検査表テンプレート 詳細 (MS28, design.md §8.2 / §13.4).
 *
 * サマリ（コード・名称・関連工程・状態）+ タブ: テンプレート情報 / 検査項目 /
 * 履歴。検査項目はサブテーブルでインライン追加・編集・削除する（個別ページなし）。
 */

import {
  ActionIcon,
  Badge,
  Group,
  ScrollArea,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCircleMinus,
  IconEdit,
  IconListCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { GhostButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDateTime } from "@/lib/format";
import {
  DeleteInspectionTemplateItemModal,
  DeleteInspectionTemplateModal,
  InspectionTemplateItemModal,
  type InspectionTemplateItemRow,
  ToggleInspectionTemplateActiveModal,
} from "./InspectionTemplateModals";

const BASE_PATH = "/master/inspection-templates";

export interface InspectionTemplateDetailData {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  relatedProcessStep: string; // 未設定は ""
  isActive: boolean;
  items: InspectionTemplateItemRow[];
  createdAt: string;
  updatedAt: string;
}

/** 許容値の表示（min〜max + 単位。下限のみ / 上限のみにも対応）。 */
function toleranceLabel(item: InspectionTemplateItemRow): string {
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.toleranceMin != null && item.toleranceMax != null) {
    return `${item.toleranceMin} 〜 ${item.toleranceMax}${unit}`;
  }
  if (item.toleranceMin != null) return `${item.toleranceMin} 以上${unit}`;
  if (item.toleranceMax != null) return `${item.toleranceMax} 以下${unit}`;
  return "—";
}

export function InspectionTemplateDetail({
  record,
  auditEntries,
}: {
  record: InspectionTemplateDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<InspectionTemplateItemRow | null>(
    null,
  );
  const [deleteItem, setDeleteItem] =
    useState<InspectionTemplateItemRow | null>(null);

  const target = {
    id: record.id,
    code: record.code,
    name: record.nameJa,
    isActive: record.isActive,
  };

  // 追加時の表示順初期値: 既存の最大 + 10
  const nextSortOrder =
    record.items.length > 0
      ? Math.max(...record.items.map((i) => i.sortOrder)) + 10
      : 10;

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
      breadcrumbs={[
        "マスタ",
        { label: "検査表テンプレート", href: BASE_PATH },
        record.code,
      ]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="コード"
          value={<DocNumber>{record.code}</DocNumber>}
        />
        <FieldValue label="名称" value={record.nameJa} />
        <FieldValue label="関連工程" value={record.relatedProcessStep || "—"} />
        <FieldValue label="検査項目数" value={`${record.items.length}件`} />
        <FieldValue
          label="状態"
          value={<ActiveBadge active={record.isActive} />}
        />
      </SummaryGrid>

      <Tabs defaultValue="info">
        <Tabs.List>
          <Tabs.Tab value="info">テンプレート情報</Tabs.Tab>
          <Tabs.Tab value="items">検査項目</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="info">
          <Stack gap="sm">
            <FieldValue label="名称（日本語）" value={record.nameJa} />
            <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
            <FieldValue
              label="関連工程"
              value={record.relatedProcessStep || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="items">
          <Stack gap="sm">
            <Group justify="flex-end">
              <GhostButton
                leftSection={<IconPlus size={14} />}
                onClick={() => {
                  setEditItem(null);
                  setItemModalOpen(true);
                }}
              >
                項目を追加
              </GhostButton>
            </Group>
            {record.items.length === 0 ? (
              <EmptyState
                icon={<IconListCheck size={24} />}
                message="検査項目がありません"
              />
            ) : (
              <ScrollArea>
                <Table striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>項目名</Table.Th>
                      <Table.Th w={90}>単位</Table.Th>
                      <Table.Th w={180}>許容値</Table.Th>
                      <Table.Th w={80}>必須</Table.Th>
                      <Table.Th w={80}>表示順</Table.Th>
                      <Table.Th w={80} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.items.map((item) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Text fw={500} size="sm">
                            {item.itemNameJa}
                          </Text>
                          {item.itemNameEn &&
                            item.itemNameEn !== item.itemNameJa && (
                              <Text c="dimmed" size="xs">
                                {item.itemNameEn}
                              </Text>
                            )}
                        </Table.Td>
                        <Table.Td>{item.unit || "—"}</Table.Td>
                        <Table.Td>
                          <Text className="tabular-nums" size="sm">
                            {toleranceLabel(item)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {item.isRequired ? (
                            <Badge color="blue" variant="light">
                              必須
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="light">
                              任意
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Text className="tabular-nums" size="sm">
                            {item.sortOrder}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Tooltip label="編集" withinPortal>
                              <ActionIcon
                                aria-label="検査項目を編集"
                                color="gray"
                                onClick={() => {
                                  setEditItem(item);
                                  setItemModalOpen(true);
                                }}
                                variant="subtle"
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="削除" withinPortal>
                              <ActionIcon
                                aria-label="検査項目を削除"
                                color="red"
                                onClick={() => setDeleteItem(item)}
                                variant="subtle"
                              >
                                <IconTrash size={14} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <DeleteInspectionTemplateModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleInspectionTemplateActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
      <InspectionTemplateItemModal
        defaultSortOrder={nextSortOrder}
        item={editItem}
        onClose={() => setItemModalOpen(false)}
        onDone={() => router.refresh()}
        opened={itemModalOpen}
        templateId={record.id}
      />
      <DeleteInspectionTemplateItemModal
        item={deleteItem}
        onClose={() => setDeleteItem(null)}
        onDone={() => router.refresh()}
        opened={!!deleteItem}
      />
    </DetailShell>
  );
}
