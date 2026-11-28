"use client";

/**
 * MovementTypeTable.tsx — 移動タイプ 一覧 (ST09, design.md §8.1 / §14).
 *
 * 列: 番号 / 名称 / 向き / 出庫元要 / 入庫先要 / 表示順 / 状態。詳細ページを
 * 持たない小マスタのため、新規作成・編集はどちらも一覧上のモーダルで完結する
 * （defect-types と同じ形だが、新規もモーダル — 別ページを持たない）。
 *
 * **削除は無い** — 伝票（inventory_movements）が movement_type_id を
 * FK Restrict で参照するので、行を消すのではなく無効化 (isActive=false) に
 * 倒す。一括操作も 有効化/無効化 のみで、一括削除は提供しない。
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
  IconEdit,
  IconListNumbers,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setMovementTypesActive } from "@/app/(dashboard)/inventory/movement-types/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { CreateButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { appLabelForKey, categoryLabel } from "@/lib/app-list";
import {
  MOVEMENT_DIRECTION_COLOR,
  movementDirectionLabel,
  movementDirectionOptions,
} from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import type { MovementDirection } from "@/lib/movement-type-core";
import {
  CreateMovementTypeModal,
  EditMovementTypeModal,
  type MovementTypeModalTarget,
  ToggleMovementTypeActiveModal,
} from "./MovementTypeModals";

export interface MovementTypeRow {
  id: number;
  code: string;
  /** 表示名（現ロケール解決済み） */
  name: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  direction: MovementDirection;
  requiresFrom: boolean;
  requiresTo: boolean;
  sortOrder: number;
  isActive: boolean;
  notes: string | null;
}

function RequiredMark({ value }: { value: boolean }) {
  return value ? (
    <IconCheck color="var(--mantine-color-green-6)" size={16} />
  ) : (
    <IconX color="var(--mantine-color-gray-4)" size={16} />
  );
}

export function MovementTypeTable({ rows }: { rows: MovementTypeRow[] }) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [directionFilter, setDirectionFilter] = useUrlSelectState("direction");

  const [newOpen, setNewOpen] = useState(false);
  const [editRow, setEditRow] = useState<MovementTypeModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<MovementTypeModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
    setDirectionFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    const matchesDirection =
      !directionFilter || r.direction === directionFilter;
    return matchesSearch && matchesStatus && matchesDirection;
  });

  const bulkSetActive = (targets: MovementTypeRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setMovementTypesActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? tr("common.enabled2") : tr("common.disabled2"),
          message: isActive
            ? tr("inventory.movementTypes.bulkEnabled", {
                count: targets.length,
              })
            : tr("inventory.movementTypes.bulkDisabled", {
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

  const columns: Column<MovementTypeRow>[] = [
    {
      key: "code",
      header: tr("inventory.movementTypes.number"),
      sortable: true,
      width: 100,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: tr("common.name2"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "direction",
      header: tr("inventory.movementTypes.direction"),
      sortable: true,
      width: 110,
      sortValue: (r) => r.direction,
      render: (r) => (
        <Badge
          color={MOVEMENT_DIRECTION_COLOR[r.direction] ?? "gray"}
          variant="light"
        >
          {movementDirectionLabel(r.direction, locale)}
        </Badge>
      ),
    },
    {
      key: "requiresFrom",
      header: tr("inventory.movementTypes.requiresFrom"),
      hideable: true,
      align: "center",
      width: 90,
      sortValue: (r) => (r.requiresFrom ? 1 : 0),
      render: (r) => <RequiredMark value={r.requiresFrom} />,
    },
    {
      key: "requiresTo",
      header: tr("inventory.movementTypes.requiresTo"),
      hideable: true,
      align: "center",
      width: 90,
      sortValue: (r) => (r.requiresTo ? 1 : 0),
      render: (r) => <RequiredMark value={r.requiresTo} />,
    },
    {
      key: "sortOrder",
      header: tr("common.sortOrder"),
      sortable: true,
      hideable: true,
      align: "right",
      width: 90,
      sortValue: (r) => r.sortOrder,
      render: (r) => (
        <Text className="tabular-nums" size="sm">
          {r.sortOrder}
        </Text>
      ),
    },
    {
      key: "isActive",
      header: tr("common.status"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={
        <CreateButton
          onClick={() => setNewOpen(true)}
          style={{ flexShrink: 0 }}
        >
          {isMobile ? tr("common.new") : tr("common.new2")}
        </CreateButton>
      }
      breadcrumbs={[
        categoryLabel("在庫", locale), // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
        appLabelForKey("movement-types", "移動タイプ", locale), // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
      ]}
      filters={
        <Group gap="xs" wrap="nowrap">
          <Select
            aria-label={tr("inventory.movementTypes.direction")}
            clearable
            data={movementDirectionOptions(locale)}
            onChange={setDirectionFilter}
            placeholder={tr("inventory.movementTypes.direction")}
            value={directionFilter}
            w={isMobile ? 110 : 140}
          />
          <Select
            aria-label={tr("common.status")}
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("common.status")}
            value={statusFilter}
            w={isMobile ? 110 : 120}
          />
        </Group>
      }
      onReset={reset}
      search={
        <TextInput
          aria-label={tr("common.searchByCodeOrName")}
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("common.searchByCodeOrName")}
          value={search}
        />
      }
      title={appLabelForKey("movement-types", "移動タイプ", locale)} // i18n-ignore — app-list のカテゴリ名 / ja 既定値（対訳は app-list.ts が持つ）
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
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "sortOrder", dir: "asc" }}
        emptyAction={
          <CreateButton onClick={() => setNewOpen(true)}>
            {tr("common.new2")}
          </CreateButton>
        }
        emptyIcon={<IconListNumbers size={24} />}
        emptyMessage={tr("inventory.movementTypes.noMovementTypes")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => setEditRow(r)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Badge
                  color={MOVEMENT_DIRECTION_COLOR[r.direction] ?? "gray"}
                  size="xs"
                  variant="light"
                >
                  {movementDirectionLabel(r.direction, locale)}
                </Badge>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: tr("common.edit2"),
            icon: <IconEdit size={14} />,
            onAction: (r) => setEditRow(r),
          },
          {
            label: row.isActive ? tr("common.disable") : tr("common.enable"),
            icon: <IconCircleMinus size={14} />,
            onAction: (r) => setToggleRow(r),
          },
        ]}
        selectable
        urlState
      />

      <CreateMovementTypeModal
        onClose={() => setNewOpen(false)}
        onDone={() => router.refresh()}
        opened={newOpen}
      />
      <EditMovementTypeModal
        onClose={() => setEditRow(null)}
        onDone={() => router.refresh()}
        opened={!!editRow}
        target={editRow}
      />
      <ToggleMovementTypeActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
