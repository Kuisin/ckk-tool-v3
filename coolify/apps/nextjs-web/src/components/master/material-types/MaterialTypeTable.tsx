"use client";

/**
 * MaterialTypeTable.tsx — 材種 一覧 (MS05, design.md §8.1 / §14).
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
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteMaterialTypes,
  setMaterialTypesActive,
} from "@/app/(dashboard)/master/material-types/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
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

export function MaterialTypeTable({ rows }: { rows: MaterialTypeRow[] }) {
  const tr = useTranslations();
  const STRUCTURED_OPTIONS = [
    { value: "structured", label: tr("master.materialTypeTable.structured") },
    { value: "legacy", label: tr("master.materialTypeTable.legacy") },
  ];
  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [structuredFilter, setStructuredFilter] =
    useUrlSelectState("structured");

  const [deleteRow, setDeleteRow] = useState<MaterialTypeModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<MaterialTypeModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
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
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("master.materialTypeTable.bulkEnabled", {
                count: targets.length,
              })
            : tr("master.materialTypeTable.bulkDisabled", {
                count: targets.length,
              }),
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: MaterialTypeRow[]) => {
    openConfirm({
      title: tr("master.materialTypes.bulkDeleteMaterialTypes"),
      message: tr("master.materialTypeTable.bulkDeleteConfirm", {
        count: targets.length,
      }),
      confirmLabel: tr("common.delete2"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteMaterialTypes(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.materialTypeTable.bulkDeleted", {
                count: targets.length,
              }),
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("common.error2"),
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
      header: tr("common.materialTypeCode"),
      sortable: true,
      width: 160,
      sortValue: (r) => r.code ?? "",
      render: (r) =>
        r.code ? (
          <DocNumber>{r.code}</DocNumber>
        ) : (
          <Badge color="gray" size="xs" variant="light">
            {tr("master.materialTypes.notConverted")}
          </Badge>
        ),
    },
    {
      key: "name",
      header: tr("common.name2"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "manufacturerName",
      header: tr("common.manufacturer"),
      sortable: true,
      hideable: true,
      width: 120,
      render: (r) => r.manufacturerName || "—",
    },
    {
      key: "shapeName",
      header: tr("common.shape"),
      sortable: true,
      hideable: true,
      width: 90,
      render: (r) => r.shapeName || "—",
    },
    {
      key: "isActive",
      header: tr("common.status"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
    {
      key: "updatedAt",
      header: tr("common.updated"),
      sortable: true,
      hideable: true,
      width: 120,
      render: (r) => fmt.date(r.updatedAt),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.masterData"), tr("common.materialTypes")]}
      filters={
        <>
          <Select
            clearable
            data={STRUCTURED_OPTIONS}
            onChange={setStructuredFilter}
            placeholder={tr("master.materialTypes.conversionStatus")}
            style={isMobile ? { flex: 1 } : undefined}
            value={structuredFilter}
            w={isMobile ? undefined : 140}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("common.status")}
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
          placeholder={tr("common.searchByMaterialTypeCodeOr")}
          value={search}
        />
      }
      title={tr("common.materialTypes")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("common.bulkEnable"),
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: tr("common.bulkDisable"),
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
          },
          {
            label: tr("common.bulkDelete"),
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
        emptyMessage={tr("master.materialTypes.thereAreNoMaterialTypes")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">
                  {r.code ?? tr("master.materialTypes.notConverted")}
                </DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Text c="dimmed" size="xs">
                  更新: {fmt.date(r.updatedAt)}
                </Text>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: tr("common.edit2"),
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? tr("common.disable") : tr("common.enable"),
            icon: <IconCircleMinus size={14} />,
            onAction: (r) => setToggleRow(r),
          },
          {
            label: tr("common.delete"),
            icon: <IconTrash size={14} />,
            color: "red",
            onAction: (r) => setDeleteRow(r),
          },
        ]}
        selectable
        urlState
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
