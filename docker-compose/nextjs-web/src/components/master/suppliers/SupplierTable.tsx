"use client";

/**
 * SupplierTable.tsx — 外注企業 一覧 (MS06, design.md §8.1 / §14).
 *
 * bp.business_partners（VENDOR ロール）。仕入先/外注先は vendor_type で区別。
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
  IconBuildingFactory2,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteBps,
  setBpsActive,
} from "@/app/(dashboard)/master/_shared/bp-actions";
import type { SupplierRow } from "@/app/(dashboard)/master/_shared/bp-data";
import {
  type BpModalTarget,
  DeleteBpModal,
  ToggleBpActiveModal,
} from "@/components/master/bp/BpModals";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { VENDOR_TYPE_LABEL, VENDOR_TYPE_OPTIONS } from "@/lib/enum-labels";

const BASE_PATH = "/master/suppliers";

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

function VendorTypeBadge({ type }: { type: string }) {
  return (
    <Badge
      color={type === "OUTSOURCE" ? "orange" : "teal"}
      size="sm"
      variant="light"
    >
      {VENDOR_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export function SupplierTable({ rows }: { rows: SupplierRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [deleteRow, setDeleteRow] = useState<BpModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<BpModalTarget | null>(null);

  const reset = () => {
    setSearch("");
    setTypeFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.bpCode.includes(search) || r.name.includes(search);
    const matchesType = !typeFilter || r.vendorType === typeFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesStatus;
  });

  const bulkSetActive = (targets: SupplierRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setBpsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : "無効化しました",
          message: `${targets.length}件の外注企業を${isActive ? "有効化" : "無効化"}しました`,
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

  const bulkDelete = (targets: SupplierRow[]) => {
    openConfirm({
      title: "外注企業の一括削除",
      message: `選択中の${targets.length}件の外注企業を削除します。この操作は取り消せません。`,
      confirmLabel: "削除する",
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteBps(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `${targets.length}件の外注企業を削除しました`,
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

  const columns: Column<SupplierRow>[] = [
    {
      key: "bpCode",
      header: "BPコード",
      sortable: true,
      width: 130,
      render: (r) => <DocNumber>{r.bpCode}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "vendorType",
      header: "外注種別",
      sortable: true,
      width: 110,
      render: (r) => <VendorTypeBadge type={r.vendorType} />,
    },
    {
      key: "leadTimeDays",
      header: "標準リードタイム",
      sortable: true,
      hideable: true,
      width: 150,
      sortValue: (r) => r.leadTimeDays ?? -1,
      render: (r) => (r.leadTimeDays != null ? `${r.leadTimeDays}日` : "—"),
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
      breadcrumbs={["マスタ", "外注企業"]}
      filters={
        <>
          <Select
            clearable
            data={VENDOR_TYPE_OPTIONS}
            onChange={setTypeFilter}
            placeholder="外注種別"
            style={isMobile ? { flex: 1 } : undefined}
            value={typeFilter}
            w={isMobile ? undefined : 140}
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
          placeholder="BPコード・名称で検索"
          value={search}
        />
      }
      title="外注企業"
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
        defaultSort={{ key: "bpCode", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconBuildingFactory2 size={24} />}
        emptyMessage="外注企業がありません"
        getRowId={(r) => r.id}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.bpCode}</DocNumber>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <VendorTypeBadge type={r.vendorType} />
                  {r.leadTimeDays != null && (
                    <Text c="dimmed" size="xs">
                      LT {r.leadTimeDays}日
                    </Text>
                  )}
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

      <DeleteBpModal
        entityLabel="外注企業"
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleBpActiveModal
        entityLabel="外注企業"
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
