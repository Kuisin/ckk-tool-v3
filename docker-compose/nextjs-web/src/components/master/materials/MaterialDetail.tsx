"use client";

/**
 * MaterialDetail.tsx — 素材 詳細 (MS25, design.md §8.2).
 *
 * Ported from design-preview (designs/master/materials/detail.tsx) and backed
 * by server data. 関連タブ: 在庫サマリ + この素材を使う製品。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
 */

import { Stack, Table, Tabs, Text } from "@mantine/core";
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
import { MATERIAL_FORM_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";
import type { Option } from "@/lib/mock";
import {
  DeleteMaterialModal,
  DuplicateMaterialModal,
  ToggleMaterialActiveModal,
} from "./MaterialModals";

const BASE_PATH = "/master/materials";

export interface MaterialDetailData {
  id: string;
  materialTypeId: string;
  materialTypeName: string;
  nameJa: string;
  nameEn: string;
  form: string;
  unit: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  products: { id: string; name: string }[];
}

export function MaterialDetail({
  record,
  typeOptions,
  auditEntries,
}: {
  record: MaterialDetailData;
  typeOptions: Option[];
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
    name: record.nameJa,
    isActive: record.isActive,
    materialTypeId: record.materialTypeId,
    form: record.form,
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
      breadcrumbs={["マスタ", { label: "素材", href: BASE_PATH }, record.id]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="素材コード"
          value={<DocNumber>{record.id}</DocNumber>}
        />
        <FieldValue
          label="材種"
          value={
            <DocNumber c="blue">
              {record.materialTypeId}
              {record.materialTypeName ? `（${record.materialTypeName}）` : ""}
            </DocNumber>
          }
        />
        <FieldValue
          label="形態"
          value={MATERIAL_FORM_LABEL[record.form] ?? record.form}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
        <FieldValue label="単位" value={record.unit} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <FieldValue label="備考" value={record.notes || "—"} />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="lg">
            <Stack gap="xs">
              <Text fw={600} size="sm">
                使用製品
              </Text>
              {record.products.length === 0 ? (
                <Text c="dimmed" size="sm">
                  この素材を使用する製品はありません
                </Text>
              ) : (
                <Table highlightOnHover striped withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>製品コード</Table.Th>
                      <Table.Th>名称</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {record.products.map((p) => (
                      <Table.Tr
                        className="cursor-pointer"
                        key={p.id}
                        onClick={() => router.push(`/master/products/${p.id}`)}
                      >
                        <Table.Td>
                          <DocNumber c="blue">{p.id}</DocNumber>
                        </Table.Td>
                        <Table.Td>{p.name}</Table.Td>
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

      <DeleteMaterialModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <DuplicateMaterialModal
        onClose={() => setDuplicateOpen(false)}
        opened={duplicateOpen}
        source={target}
        typeOptions={typeOptions}
      />
      <ToggleMaterialActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
