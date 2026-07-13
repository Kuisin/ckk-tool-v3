"use client";

/**
 * InspectionTemplateTable.tsx — 検査表テンプレート 一覧 (MS08, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 関連工程 / 項目数 / 状態。検索 + 状態フィルタ、
 * 一括有効化・無効化・削除。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconListCheck,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteInspectionTemplates,
  setInspectionTemplatesActive,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DeleteInspectionTemplateModal,
  type InspectionTemplateModalTarget,
  ToggleInspectionTemplateActiveModal,
} from "./InspectionTemplateModals";

const BASE_PATH = "/master/inspection-templates";

export interface InspectionTemplateRow {
  id: number;
  code: string;
  name: string;
  relatedProcessStep: string; // 未設定は ""
  itemCount: number;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function InspectionTemplateTable({
  rows,
}: {
  rows: InspectionTemplateRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] =
    useState<InspectionTemplateModalTarget | null>(null);
  const [toggleRow, setToggleRow] =
    useState<InspectionTemplateModalTarget | null>(null);

  const reset = () => {
    setSearch("");
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.code.includes(search) ||
      r.name.includes(search) ||
      r.relatedProcessStep.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const bulkSetActive = (
    targets: InspectionTemplateRow[],
    isActive: boolean,
  ) => {
    startTransition(async () => {
      const result = await setInspectionTemplatesActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の検査表テンプレートを${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: InspectionTemplateRow[]) => {
    openConfirm({
      title: "検査表テンプレートの一括削除",
      message: `選択中の${targets.length}件の検査表テンプレートを削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteInspectionTemplates(
            targets.map((r) => r.id),
          );
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の検査表テンプレートを削除しました`,
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

  const columns: Column<InspectionTemplateRow>[] = [
    {
      key: "code",
      header: "コード",
      sortable: true,
      width: 180,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "relatedProcessStep",
      header: "関連工程",
      sortable: true,
      hideable: true,
      width: 220,
      sortValue: (r) => r.relatedProcessStep,
      render: (r) => r.relatedProcessStep || "—",
    },
    {
      key: "itemCount",
      header: "項目数",
      sortable: true,
      hideable: true,
      width: 90,
      align: "right",
      sortValue: (r) => r.itemCount,
      render: (r) => `${r.itemCount}件`,
    },
    {
      key: "isActive",
      header: "状態",
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["マスタ", "検査表テンプレート"]}
      filters={
        <Select
          clearable
          data={STATUS_OPTIONS}
          onChange={setStatusFilter}
          placeholder="状態"
          style={isMobile ? { flex: 1 } : undefined}
          value={statusFilter}
          w={isMobile ? undefined : 120}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="コード・名称・関連工程で検索"
          value={search}
        />
      }
      title="検査表テンプレート"
    >
      <DataTable
        bulkActions={[
          {
            label: "一括有効化",
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: "一括無効化",
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
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
        defaultSort={{ key: "code", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconListCheck size={24} />}
        emptyMessage="検査表テンプレートがありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <Text c="dimmed" size="xs" truncate>
                    {r.relatedProcessStep || "関連工程なし"}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.itemCount}項目
                  </Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: "編集",
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? "無効化" : "有効化",
            icon: <IconCircleMinus size={14} />,
            onAction: (r) => setToggleRow(r),
          },
          {
            label: "削除",
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: (r) => setDeleteRow(r),
          },
        ]}
        selectable
      />

      <DeleteInspectionTemplateModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleInspectionTemplateActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
