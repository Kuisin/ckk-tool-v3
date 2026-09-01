"use client";

/**
 * MaterialTable.tsx — 素材 一覧 (MS06, design.md §8.1 / §14).
 *
 * 列: 素材コード / 材種 / 直径 / 全長 / 黒皮研磨 / 状態。
 * 材種フィルタは表示中の素材が使う材種から導出する（全 3,555 材種を送らない）。
 */

import { Group, Paper, Select, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBolt,
  IconCheck,
  IconCircleMinus,
  IconEdit,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import { matchesKeywordQuery } from "@/lib/master-keywords";
import {
  DeleteMaterialModal,
  type MaterialModalTarget,
  ToggleMaterialActiveModal,
} from "./MaterialModals";

const BASE_PATH = "/master/materials";

export interface MaterialRow {
  id: number;
  code: string;
  materialTypeCode: string;
  materialTypeName: string;
  name: string;
  diameterMm: number;
  lengthMm: number;
  surfaceFinish: string;
  unit: string;
  /** 検索・AI 突合用のキーワード（match_names）。検索の当たり判定に混ぜる。 */
  matchNames: string[];
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function MaterialTable({ rows }: { rows: MaterialRow[] }) {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [typeFilter, setTypeFilter] = useUrlSelectState("type");
  const [finishFilter, setFinishFilter] = useUrlSelectState("finish");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");

  const [deleteRow, setDeleteRow] = useState<MaterialModalTarget | null>(null);
  const [toggleRow, setToggleRow] = useState<MaterialModalTarget | null>(null);

  // フィルタ選択肢は表示データから導出（材種・黒皮研磨とも件数は小さい）
  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (!seen.has(r.materialTypeCode)) {
        seen.set(
          r.materialTypeCode,
          `${r.materialTypeCode}（${r.materialTypeName}）`,
        );
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);
  const finishOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) seen.add(r.surfaceFinish);
    return [...seen].map((v) => ({ value: v, label: v }));
  }, [rows]);

  const reset = () => {
    setSearch(null);
    setTypeFilter(null);
    setFinishFilter(null);
    setStatusFilter(null);
  };

  const filtered = rows.filter((r) => {
    // キーワード（match_names）も検索対象 — 略称・読み・英字で辿り着ける。
    const matchesSearch =
      !search ||
      matchesKeywordQuery(
        {
          code: r.code,
          name: r.name,
          keywords: r.matchNames,
          extra: [r.materialTypeCode, r.materialTypeName],
        },
        search,
      );
    const matchesType = !typeFilter || r.materialTypeCode === typeFilter;
    const matchesFinish = !finishFilter || r.surfaceFinish === finishFilter;
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    return matchesSearch && matchesType && matchesFinish && matchesStatus;
  });

  const bulkSetActive = (targets: MaterialRow[], isActive: boolean) => {
    startTransition(async () => {
      const result = await setMaterialsActive(
        targets.map((r) => r.id),
        isActive,
      );
      if (result.ok) {
        notifications.show({
          title: isActive ? "有効化しました" : tr("無効化しました"),
          message: `${targets.length}件の素材を${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: MaterialRow[]) => {
    openConfirm({
      title: tr("素材の一括削除"),
      message: `選択中の${targets.length}件の素材を削除します。この操作は取り消せません。`,
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteMaterials(targets.map((r) => r.id));
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `${targets.length}件の素材を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
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
      key: "code",
      header: tr("素材コード"),
      sortable: true,
      width: 200,
      sortValue: (r) => r.code,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "materialTypeCode",
      header: tr("材種"),
      sortable: true,
      hideable: true,
      width: 140,
      render: (r) => <DocNumber c="dimmed">{r.materialTypeCode}</DocNumber>,
    },
    {
      key: "name",
      header: tr("名称"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "diameterMm",
      header: tr("直径"),
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => r.diameterMm,
      render: (r) => `φ${r.diameterMm}`,
    },
    {
      key: "lengthMm",
      header: tr("全長"),
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => r.lengthMm,
      render: (r) => `${r.lengthMm}mm`,
    },
    {
      key: "surfaceFinish",
      header: tr("黒皮研磨"),
      sortable: true,
      hideable: true,
      width: 110,
      render: (r) => r.surfaceFinish,
    },
    {
      key: "isActive",
      header: tr("状態"),
      sortable: true,
      width: 90,
      sortValue: (r) => (r.isActive ? 1 : 0),
      render: (r) => <ActiveBadge active={r.isActive} />,
    },
  ];

  return (
    <ListShell
      action={<NewButton href={`${BASE_PATH}/new`} />}
      breadcrumbs={[tr("マスタ"), tr("素材")]}
      filters={
        <>
          <Select
            clearable
            data={typeOptions}
            onChange={setTypeFilter}
            placeholder={tr("材種")}
            searchable
            style={isMobile ? { flex: 1 } : undefined}
            value={typeFilter}
            w={isMobile ? undefined : 200}
          />
          <Select
            clearable
            data={finishOptions}
            onChange={setFinishFilter}
            placeholder={tr("黒皮研磨")}
            style={isMobile ? { flex: 1 } : undefined}
            value={finishFilter}
            w={isMobile ? undefined : 130}
          />
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("状態")}
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
          placeholder={tr("素材コード・名称・キーワードで検索")}
          value={search}
        />
      }
      title={tr("素材")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("一括有効化"),
            icon: <IconCheck size={16} />,
            color: "green",
            onAction: (rs) => bulkSetActive(rs, true),
          },
          {
            label: tr("一括無効化"),
            icon: <IconCircleMinus size={16} />,
            color: "orange",
            onAction: (rs) => bulkSetActive(rs, false),
          },
          {
            label: tr("一括削除"),
            icon: <IconTrash size={16} />,
            color: "red",
            onAction: bulkDelete,
          },
        ]}
        columns={columns}
        data={filtered}
        defaultSort={{ key: "code", dir: "asc" }}
        emptyAction={<NewButton href={`${BASE_PATH}/new`} />}
        emptyIcon={<IconBolt size={24} />}
        emptyMessage={tr("素材がありません")}
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
                  <Text c="dimmed" size="xs">
                    φ{r.diameterMm}×{r.lengthMm}mm
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.surfaceFinish}
                  </Text>
                </Group>
              </Stack>
              <ActiveBadge active={r.isActive} />
            </Group>
          </Paper>
        )}
        rowActions={(row) => [
          {
            label: tr("編集"),
            icon: <IconEdit size={14} />,
            onAction: (r) => router.push(`${BASE_PATH}/${r.id}/edit`),
          },
          {
            label: row.isActive ? "無効化" : tr("有効化"),
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
        urlState
      />

      <DeleteMaterialModal
        onClose={() => setDeleteRow(null)}
        onDone={() => router.refresh()}
        opened={!!deleteRow}
        target={deleteRow}
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
