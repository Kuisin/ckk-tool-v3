"use client";

/**
 * OwnCompanyTable.tsx — 自社法人 一覧 (MS0I, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 登録番号 / 拠点数 / 状態 / 更新日。法人は数社しか
 * 無いので一括操作は持たない（行の操作だけ）。
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
import {
  IconBuildingBank,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import {
  DeleteOwnCompanyModal,
  type OwnCompanyModalTarget,
  ToggleOwnCompanyActiveModal,
} from "./OwnCompanyModals";

const BASE_PATH = "/master/own-companies";

export interface OwnCompanyRow {
  id: number;
  code: string;
  name: string;
  invoiceRegistrationNo: string | null;
  plantCount: number;
  isDefault: boolean;
  isActive: boolean;
  /** ISO timestamp */
  updatedAt: string;
}

export function OwnCompanyTable({ rows }: { rows: OwnCompanyRow[] }) {
  const tr = useTranslations();
  const STATUS_OPTIONS = [
    { value: "active", label: tr("common.enabled") },
    { value: "inactive", label: tr("common.disabled") },
  ];
  const fmt = useFormat();
  const router = useRouter();
  const isMobile = useIsMobile();

  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [deleteRow, setDeleteRow] = useState<OwnCompanyModalTarget | null>(
    null,
  );
  const [toggleRow, setToggleRow] = useState<OwnCompanyModalTarget | null>(
    null,
  );

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search || r.code.includes(search) || r.name.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const defaultBadge = (
    <Badge color="blue" size="xs" variant="light">
      {tr("master.ownCompanies.default")}
    </Badge>
  );

  const columns: Column<OwnCompanyRow>[] = [
    {
      key: "code",
      header: tr("common.code"),
      sortable: true,
      width: 120,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: tr("common.name2"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm">{r.name}</Text>
          {r.isDefault && defaultBadge}
        </Group>
      ),
    },
    {
      key: "registrationNo",
      header: tr("master.ownCompanies.registrationNo"),
      hideable: true,
      width: 170,
      sortValue: (r) => r.invoiceRegistrationNo ?? "",
      render: (r) =>
        r.invoiceRegistrationNo ? (
          <DocNumber>{r.invoiceRegistrationNo}</DocNumber>
        ) : (
          "—"
        ),
    },
    {
      key: "plants",
      header: tr("master.ownCompanies.plantCount"),
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => r.plantCount,
      render: (r) => r.plantCount,
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
      sortValue: (r) => r.updatedAt,
      render: (r) => fmt.date(r.updatedAt),
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("common.masterData"), tr("master.ownCompanies.title")]}
      filters={
        <Select
          aria-label={tr("common.status")}
          clearable
          data={STATUS_OPTIONS}
          onChange={setStatusFilter}
          placeholder={tr("common.status")}
          value={statusFilter}
          w={isMobile ? 110 : 120}
        />
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
      title={tr("master.ownCompanies.title")}
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "code", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconBuildingBank size={24} />}
        emptyMessage={tr("master.ownCompanies.empty")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <DocNumber c="dimmed">{r.code}</DocNumber>
                <Group gap="xs" wrap="nowrap">
                  <Text fw={600} size="sm" truncate>
                    {r.name}
                  </Text>
                  {r.isDefault && defaultBadge}
                </Group>
                <Text c="dimmed" size="xs">
                  {fmt.date(r.updatedAt)}
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
          ...(row.isDefault
            ? []
            : [
                {
                  label: row.isActive
                    ? tr("common.disable")
                    : tr("common.enable"),
                  icon: <IconCircleMinus size={14} />,
                  onAction: (r: OwnCompanyRow) => setToggleRow(r),
                },
                {
                  label: tr("common.delete"),
                  icon: <IconTrash size={14} />,
                  color: "red",
                  onAction: (r: OwnCompanyRow) => setDeleteRow(r),
                },
              ]),
        ]}
        urlState
      />

      <DeleteOwnCompanyModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
      />
      <ToggleOwnCompanyActiveModal
        onClose={() => setToggleRow(null)}
        onDone={() => router.refresh()}
        opened={!!toggleRow}
        target={toggleRow}
      />
    </ListShell>
  );
}
