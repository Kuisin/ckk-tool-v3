"use client";

/**
 * MaterialTypeTable.tsx — 材種 一覧 (MS04, design.md §8.1 / §14).
 *
 * Ported from design-preview (designs/master/material-types/list.tsx) and
 * backed by server data (master.material_types via Prisma). Filtering stays
 * client-side — the master tables are small.
 */

import {
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAtom,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteMaterialTypes,
  setMaterialTypesActive,
} from "@/app/(dashboard)/master/material-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { formatDate } from "@/lib/format";
import {
  DeleteMaterialTypeModal,
  type MaterialTypeModalTarget,
  ToggleMaterialTypeActiveModal,
} from "./MaterialTypeModals";

const BASE_PATH = "/master/material-types";

export interface MaterialTypeRow {
  id: number;
  /** 材種コード（変換済のみ、未変換は null）。 */
  code: string | null;
  name: string;
  /** 変換済（コード構成あり）か — 未変換はレガシー取込プレースホルダ。 */
  structured: boolean;
  manufacturerName: string;
  shapeName: string;
  isActive: boolean;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

const STRUCTURED_OPTIONS = [
  { value: "structured", label: "変換済" },
  { value: "legacy", label: "未変換" },
];

export function MaterialTypeTable({ rows }: { rows: MaterialTypeRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [structuredFilter, setStructuredFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<MaterialTypeModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<MaterialTypeModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch("");
    setStatusFilter(null);
    setStructuredFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || (r.code ?? "").includes(search) || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    const matchesStructured =
      !structuredFilter ||
      (structuredFilter === "structured" ? r.structured : !r.structured);
    return matchesSearch && matchesStatus && matchesStructured;
  });

  const bulkSetActive = (targets: MaterialTypeRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setMaterialTypesActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の材種を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: MaterialTypeRow[]) => {
    openConfirm({
      title: "材種の一括削除",
      message: `選択中の${targets.length}件の材種を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteMaterialTypes(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の材種を削除しました`,
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

  const columns: Column<MaterialTypeRow>[] = [
    {
      key: "code",
      header: "材種コード",
      sortable: true,
      width: 160,
      sortValue: (r) => r.code ?? "",
      render: (r) =>
        r.code ? (
          <DocNumber>{r.code}</DocNumber>
        ) : (
          <Badge color="gray" size="xs" variant="light">
            未変換
          </Badge>
        ),
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "manufacturerName",
      header: "メーカー",
      sortable: true,
      hideable: true,
      width: 120,
      render: (r) => r.manufacturerName || "—",
    },
    {
      key: "shapeName",
      header: "形状",
      sortable: true,
      hideable: true,
      width: 90,
      render: (r) => r.shapeName || "—",
    },
    {
      key: "isActive",
      header: "状態",
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
    {
      key: "updatedAt",
      header: "更新日",
      sortable: true,
      hideable: true,
      width: 120,
      render: (r) => formatDate(r.updatedAt),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={["マスタ", "材種"]}
      filters={
        <>
          <Select
            clearable
            data={STRUCTURED_OPTIONS}
            onChange={setStructuredFilter}
            placeholder="変換状態"
            style={isMobile ? { flex: 1 } : undefined}
            value={structuredFilter}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder="状態"
            style={isMobile ? { flex: 1 } : undefined}
            value={statusFilter}
            w={isMobile ? undefined : 160}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="材種コード・名称で検索"
          value={search}
        />
      }
      title="材種"
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
        emptyIcon={<IconAtom size={24} />}
        emptyMessage="材種がありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code ?? "未変換"}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Text c="dimmed" size="xs">
                  更新: {formatDate(r.updatedAt)}
                </Text>
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

      <DeleteMaterialTypeModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleMaterialTypeActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
