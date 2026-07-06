"use client";

/**
 * ProductTable.tsx — 製品 一覧 (MS03, design.md §8.1 / §14).
 *
 * Ported from design-preview (designs/master/products/list.tsx) and backed by
 * server data (master.products via Prisma).
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
  IconCheck,
  IconCircleMinus,
  IconCopy,
  IconCylinder,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteProducts,
  setProductsActive,
} from "@/app/(dashboard)/master/products/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { Option } from "@/lib/mock";
import {
  DeleteProductModal,
  DuplicateProductModal,
  type ProductModalTarget,
  ToggleProductActiveModal,
} from "./ProductModals";

const BASE_PATH = "/master/products";

export interface ProductRow {
  id: number;
  /** 製品コード PRD-…（レガシー取込は未採番 = null）。 */
  code: string | null;
  name: string;
  materialId: string | null;
  unit: string;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function ProductTable({
  rows,
  materialOptions,
}: {
  rows: ProductRow[];
  materialOptions: Option[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [materialFilter, setMaterialFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<ProductModalTarget | null>(null);
  const [duplicateRow, setDuplicateRow] = useState<ProductModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<ProductModalTarget | null>(null);

  const reset = () => {
    setSearch("");
    setMaterialFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || (r.code ?? "").includes(search) || r.name.includes(search);
    const matchesMaterial = !materialFilter || r.materialId === materialFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesMaterial && matchesStatus;
  });

  const bulkSetActive = (targets: ProductRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setProductsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の製品を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: ProductRow[]) => {
    openConfirm({
      title: "製品の一括削除",
      message: `選択中の${targets.length}件の製品を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteProducts(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の製品を削除しました`,
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

  const columns: Column<ProductRow>[] = [
    {
      key: "code",
      header: "製品コード",
      sortable: true,
      width: 160,
      sortValue: (r) => r.code ?? "",
      render: (r) =>
        r.code ? (
          <DocNumber>{r.code}</DocNumber>
        ) : (
          <Badge color="gray" size="xs" variant="light">
            未採番
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
      key: "materialId",
      header: "素材",
      sortable: true,
      hideable: true,
      render: (r) =>
        r.materialId ? <DocNumber c="dimmed">{r.materialId}</DocNumber> : "—",
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
      breadcrumbs={["マスタ", "製品"]}
      filters={
        <>
          <Select
            clearable
            data={materialOptions}
            onChange={setMaterialFilter}
            placeholder="素材"
            searchable
            style={isMobile ? { flex: 1 } : undefined}
            value={materialFilter}
            w={isMobile ? undefined : 220}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder="状態"
            value={statusFilter}
            w={isMobile ? 110 : 120}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="製品コード・名称で検索"
          value={search}
        />
      }
      title="製品"
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
        emptyIcon={<IconCylinder size={24} />}
        emptyMessage="製品がありません"
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code ?? "未採番"}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  {r.materialId && (
                    <DocNumber c="dimmed">{r.materialId}</DocNumber>
                  )}
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

      <DeleteProductModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <DuplicateProductModal
        materialOptions={materialOptions}
        onClose={() => setDuplicateRow(null)}
        opened={!!duplicateRow}
        source={duplicateRow}
      />
      <ToggleProductActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
