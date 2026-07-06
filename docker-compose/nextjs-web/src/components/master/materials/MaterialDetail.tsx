"use client";

/**
 * MaterialDetail.tsx — 素材 詳細 (MS25, design.md §8.2).
 *
 * コード構成（材種×黒皮研磨×径×全長×種類）のサマリ + 関連（使用製品）+
 * 履歴（audit_logs）。構成は作成後不変なので表示のみ。
 */

import { Stack, Table, Tabs, Text } from "@mantine/core";
import { IconCircleMinus, IconTrash } from "@tabler/icons-react";
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
import { formatDateTime } from "@/lib/format";
import {
  DeleteMaterialModal,
  ToggleMaterialActiveModal,
} from "./MaterialModals";

const BASE_PATH = "/master/materials";

export interface MaterialDetailData {
  id: string;
  materialTypeId: string;
  materialTypeName: string;
  surfaceFinish: string;
  diameterMm: number;
  lengthMm: number;
  kindCode: string;
  nominalDiameterMm: number | null;
  manufacturerModel: string;
  nameJa: string;
  nameEn: string;
  unit: string;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  products: { id: string; name: string }[];
}

export function MaterialDetail({
  record,
  auditEntries,
}: {
  record: MaterialDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  const target = {
    id: record.id,
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
        <FieldValue label="黒皮・研磨" value={record.surfaceFinish} />
        <FieldValue label="直径" value={`φ${record.diameterMm} mm`} />
        <FieldValue label="全長" value={`${record.lengthMm} mm`} />
        <FieldValue
          label="種類"
          value={<DocNumber>{record.kindCode}</DocNumber>}
        />
        <FieldValue
          label="呼び径"
          value={
            record.nominalDiameterMm != null
              ? `φ${record.nominalDiameterMm} mm`
              : "—"
          }
        />
        <FieldValue
          label="メーカ型式"
          value={record.manufacturerModel || "—"}
        />
        <FieldValue label="単位" value={record.unit} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="sm">
            <FieldValue label="名称（日本語）" value={record.nameJa} />
            <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
            <FieldValue label="備考" value={record.notes || "—"} />
          </Stack>
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
      <ToggleMaterialActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
