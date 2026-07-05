"use client";

/**
 * MaterialTable.tsx — 素材 一覧 (MS05, design.md §8.1 / §14).
 *
 * Ported from design-preview (designs/master/materials/list.tsx) and backed
 * by server data (master.materials via Prisma).
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBolt,
  IconCheck,
  IconCircleMinus,
  IconCopy,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteMaterials,
  setMaterialsActive,
} from "@/app/(dashboard)/master/materials/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { MATERIAL_FORM_LABEL, MATERIAL_FORM_OPTIONS } from "@/lib/enum-labels";
import type { Option } from "@/lib/mock";
import {
  DeleteMaterialModal,
  DuplicateMaterialModal,
  type MaterialModalTarget,
  ToggleMaterialActiveModal,
} from "./MaterialModals";

const BASE_PATH = "/master/materials";

export interface MaterialRow {
  id: string;
  materialTypeId: string;
  name: string;
  form: string;
  unit: string;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function MaterialTable({
  rows,
  typeOptions,
}: {
  rows: MaterialRow[];
  typeOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [formFilter, setFormFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<MaterialModalTarget | null>(null);
  const [duplicateRow, setDuplicateRow] = useState<MaterialModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<MaterialModalTarget | null>(null);

  const reset = () => {
    setSearch("");
    setTypeFilter(null);
    setFormFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.id.includes(search) || r.name.includes(search);
    const matchesType = !typeFilter || r.materialTypeId === typeFilter;
    const matchesForm = !formFilter || r.form === formFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesForm && matchesStatus;
  });

  const bulkSetActive = (targets: MaterialRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setMaterialsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の素材を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: MaterialRow[]) => {
    openConfirm({
      title: "素材の一括削除",
      message: `選択中の${targets.length}件の素材を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteMaterials(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の素材を削除しました`,
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

  const columns: Column<MaterialRow>[] = [
    {
      key: "id",
      header: "素材コード",
      sortable: true,
      width: 180,
      render: (r) => <DocNumber>{r.id}</DocNumber>,
    },
    {
      key: "materialTypeId",
      header: "材種",
      sortable: true,
      hideable: true,
      width: 120,
      render: (r) => <DocNumber c="dimmed">{r.materialTypeId}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "form",
      header: "形態",
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => MATERIAL_FORM_LABEL[r.form] ?? r.form,
      render: (r) => MATERIAL_FORM_LABEL[r.form] ?? r.form,
    },
    {
      key: "unit",
      header: "単位",
      sortable: true,
      hideable: true,
      width: 80,
      render: (r) => r.unit,
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
      breadcrumbs={["マスタ", "素材"]}
      filters={
        <>
          <Select
            clearable
            data={typeOptions}
            onChange={setTypeFilter}
            placeholder="材種"
            searchable
            style={isMobile ? { flex: 1 } : undefined}
            value={typeFilter}
            w={isMobile ? undefined : 180}
          />
          <Select
            clearable
            data={MATERIAL_FORM_OPTIONS}
            onChange={setFormFilter}
            placeholder="形態"
            style={isMobile ? { flex: 1 } : undefined}
            value={formFilter}
            w={isMobile ? undefined : 130}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder="状態"
            style={isMobile ? { flex: 1 } : undefined}
            value={statusFilter}
            w={isMobile ? undefined : 120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="素材コード・名称で検索"
          value={search}
        />
      }
      title="素材"
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
        defaultSort={{ key: "id", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconBolt size={24} />}
        emptyMessage="素材がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.id}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <Text c="dimmed" size="xs">
                    {MATERIAL_FORM_LABEL[r.form] ?? r.form}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.unit}
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
            label: "複製",
            icon: <IconCopy size={14} />,
            onAction: (r) => setDuplicateRow(r),
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

      <DeleteMaterialModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <DuplicateMaterialModal
        onClose={() => setDuplicateRow(null)}
        opened={!!duplicateRow}
        source={duplicateRow}
        typeOptions={typeOptions}
      />
      <ToggleMaterialActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
