"use client";

/**
 * MaterialTypeDetail.tsx — 材種 詳細 (MS24, design.md §8.2).
 *
 * Ported from design-preview (designs/master/material-types/detail.tsx) and
 * backed by server data. 関連タブはこの材種に紐づく素材の一覧。
 * 履歴タブは audit_logs 導入後に接続する（現状は空表示）。
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
import { useIsMobile } from "@/hooks/useViewport";
import { formatDateTime } from "@/lib/format";
import {
  DeleteMaterialTypeModal,
  ToggleMaterialTypeActiveModal,
} from "./MaterialTypeModals";

const BASE_PATH = "/master/material-types";

export interface MaterialTypeDetailData {
  id: string;
  nameJa: string;
  nameEn: string;
  descriptionJa: string;
  descriptionEn: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  materials: {
    id: string;
    name: string;
    form: string;
    unit: string;
    isActive: boolean;
  }[];
}

export function MaterialTypeDetail({
  record,
  auditEntries,
}: {
  record: MaterialTypeDetailData;
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();

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
      breadcrumbs={["マスタ", { label: "材種", href: BASE_PATH }, record.id]}
      createdAt={formatDateTime(record.createdAt)}
      status={<ActiveBadge active={record.isActive} />}
      title={record.nameJa}
      updatedAt={formatDateTime(record.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="材種コード"
          value={<DocNumber>{record.id}</DocNumber>}
        />
        <FieldValue label="名称（日本語）" value={record.nameJa} />
        <FieldValue label="名称（英語）" value={record.nameEn || "—"} />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <FieldValue
              label="説明（日本語）"
              value={record.descriptionJa || "—"}
            />
            <FieldValue
              label="説明（英語）"
              value={record.descriptionEn || "—"}
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="xs">
            <Text fw={600} size="sm">
              この材種の素材
            </Text>
            {record.materials.length === 0 ? (
              <Text c="dimmed" size="sm">
                この材種に紐づく素材はありません
              </Text>
            ) : (
              <Table highlightOnHover striped withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>素材コード</Table.Th>
                    <Table.Th>名称</Table.Th>
                    {!isMobile && <Table.Th>形態</Table.Th>}
                    {!isMobile && <Table.Th>単位</Table.Th>}
                    <Table.Th>状態</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {record.materials.map((r) => (
                    <Table.Tr
                      className="cursor-pointer"
                      key={r.id}
                      onClick={() => router.push(`/master/materials/${r.id}`)}
                    >
                      <Table.Td>
                        <DocNumber c="blue">{r.id}</DocNumber>
                      </Table.Td>
                      <Table.Td>{r.name}</Table.Td>
                      {!isMobile && <Table.Td>{r.form}</Table.Td>}
                      {!isMobile && <Table.Td>{r.unit}</Table.Td>}
                      <Table.Td>
                        <ActiveBadge active={r.isActive} />
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

      <DeleteMaterialTypeModal
        onClose={() => setDeleteOpen(false)}
        onDone={() => router.push(BASE_PATH)}
        opened={deleteOpen}
        target={target}
      />
      <ToggleMaterialTypeActiveModal
        onClose={() => setToggleOpen(false)}
        onDone={() => router.refresh()}
        opened={toggleOpen}
        target={target}
      />
    </DetailShell>
  );
}
