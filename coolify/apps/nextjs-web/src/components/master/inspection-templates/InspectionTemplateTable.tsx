"use client";

/**
 * InspectionTemplateTable.tsx — 検査表テンプレート 一覧 (MS09, design.md §8.1 / §14).
 *
 * 列: コード / 名称 / 関連工程 / 項目数 / 状態。検索 + 状態フィルタ、
 * 一括有効化・無効化・削除。
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
  IconFileExport,
  IconFolders,
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
import { InspectionTemplateGroupModal } from "@/components/master/inspection-templates/InspectionTemplateGroupModal";
import { InspectionTemplateIoModal } from "@/components/master/inspection-templates/InspectionTemplateIoModal";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { SecondaryButton } from "@/components/ui/buttons";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
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
  version: number; // 表示中の（= code 内最新の）バージョン
  versionCount: number;
  name: string;
  relatedProcessStep: string; // 未設定は ""
  productName: string; // 未設定（汎用）は ""
  groupId: number | null;
  groupName: string; // 未設定は ""
  itemCount: number;
  isActive: boolean;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "inactive", label: "無効" },
];

export function InspectionTemplateTable({
  rows,
  groupOptions,
}: {
  rows: InspectionTemplateRow[];
  /** グループの絞り込み選択肢（有効グループのみ）。 */
  groupOptions: { value: string; label: string }[];
}) {
  const tr = useTr();
  const router = useRouter();
  const isMobile = useIsMobile();
  // 書き出し / 取込。選択があればその分だけを書き出す。
  const [ioOpen, setIoOpen] = useState(false);
  const [ioIds, setIoIds] = useState<number[]>([]);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [statusFilter, setStatusFilter] = useUrlSelectState("status");
  const [groupFilter, setGroupFilter] = useUrlSelectState("group");

  const [deleteRow, setDeleteRow] =
    useState<InspectionTemplateModalTarget | null>(null);
  const [toggleRow, setToggleRow] =
    useState<InspectionTemplateModalTarget | null>(null);

  const reset = () => {
    setSearch(null);
    setStatusFilter(null);
    setGroupFilter(null);
  };

  const filtered = rows.filter((r) => {
    const matchesSearch =
      !search ||
      r.code.includes(search) ||
      r.name.includes(search) ||
      r.relatedProcessStep.includes(search);
    const matchesStatus =
      !statusFilter || (statusFilter === "active" ? r.isActive : !r.isActive);
    const matchesGroup =
      !groupFilter ||
      (groupFilter === "none"
        ? r.groupId == null
        : String(r.groupId) === groupFilter);
    return matchesSearch && matchesStatus && matchesGroup;
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
          title: isActive ? "有効化しました" : tr("無効化しました"),
          message: `${targets.length}件の検査表テンプレートを${isActive ? "有効化" : "無効化"}しました`,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  const bulkDelete = (targets: InspectionTemplateRow[]) => {
    openConfirm({
      title: tr("検査表テンプレートの一括削除"),
      message: `選択中の${targets.length}件の検査表テンプレートを削除します。この操作は取り消せません。`,
      confirmLabel: tr("削除する"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await deleteInspectionTemplates(
            targets.map((r) => r.id),
          );
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `${targets.length}件の検査表テンプレートを削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
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
      key: "version",
      header: "Ver",
      sortable: true,
      hideable: true,
      width: 90,
      sortValue: (r) => r.version,
      render: (r) => (
        <Group gap={4} wrap="nowrap">
          <Badge color="gray" size="sm" variant="outline">
            v{r.version}
          </Badge>
          {r.versionCount > 1 && (
            <Text c="dimmed" size="xs">
              全{r.versionCount}
            </Text>
          )}
        </Group>
      ),
    },
    {
      key: "name",
      header: tr("名称"),
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    {
      key: "relatedProcessStep",
      header: tr("関連工程"),
      sortable: true,
      hideable: true,
      width: 220,
      sortValue: (r) => r.relatedProcessStep,
      render: (r) => r.relatedProcessStep || "—",
    },
    {
      key: "productName",
      header: tr("対象製品"),
      sortable: true,
      hideable: true,
      width: 180,
      sortValue: (r) => r.productName,
      render: (r) => r.productName || tr("汎用"),
    },
    {
      key: "groupName",
      header: tr("グループ"),
      sortable: true,
      hideable: true,
      width: 160,
      sortValue: (r) => r.groupName,
      render: (r) =>
        r.groupName ? (
          <Badge color="gray" variant="light">
            {r.groupName}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "itemCount",
      header: tr("項目数"),
      sortable: true,
      hideable: true,
      width: 90,
      align: "right",
      sortValue: (r) => r.itemCount,
      render: (r) => `${r.itemCount}件`,
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
      action={
        <Group gap="xs" wrap="nowrap">
          {/* グループ管理 — 判定・PDF に影響しないナビゲーション用の分類 */}
          <SecondaryButton
            leftSection={<IconFolders size={14} />}
            onClick={() => setGroupModalOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "グループ" : tr("グループ管理")}
          </SecondaryButton>
          {/* 書き出し / 取込 — 環境をまたぐ持ち出しと、Excel で作った検査表の入口 */}
          <SecondaryButton
            leftSection={<IconFileExport size={14} />}
            onClick={() => setIoOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {isMobile ? "入出力" : tr("書き出し / 取込")}
          </SecondaryButton>
          <NewButton href={`${BASE_PATH}/new`} />
        </Group>
      }
      breadcrumbs={[tr("マスタ"), tr("検査表テンプレート")]}
      filters={
        <Group gap="xs" wrap="wrap">
          <Select
            clearable
            data={STATUS_OPTIONS}
            onChange={setStatusFilter}
            placeholder={tr("状態")}
            style={isMobile ? { flex: 1 } : undefined}
            value={statusFilter}
            w={isMobile ? undefined : 120}
          />
          <Select
            clearable
            data={[
              ...groupOptions,
              { value: "none", label: tr("グループなし") },
            ]}
            onChange={setGroupFilter}
            placeholder={tr("グループ")}
            style={isMobile ? { flex: 1 } : undefined}
            value={groupFilter}
            w={isMobile ? undefined : 160}
          />
        </Group>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder={tr("コード・名称・関連工程で検索")}
          value={search}
        />
      }
      title={tr("検査表テンプレート")}
    >
      <DataTable
        bulkActions={[
          {
            label: tr("選択を書き出し"),
            icon: <IconFileExport size={16} />,
            onAction: (rs) => {
              setIoIds(rs.map((r) => r.id));
              setIoOpen(true);
            },
          },
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
        emptyIcon={<IconListCheck size={24} />}
        emptyMessage={tr("検査表テンプレートがありません")}
        getRowId={(r) => String(r.id)}
        onRowClick={(r) => router.push(`${BASE_PATH}/${r.id}`)}
        renderCard={(r) => (
          <Paper p="sm" radius="sm" withBorder>
            <Group align="flex-start" justify="space-between" wrap="nowrap">
              <Stack gap={3} style={{ minWidth: 0 }}>
                <Group gap={6} wrap="nowrap">
                  <DocNumber c="dimmed">{r.code}</DocNumber>
                  <Badge color="gray" size="xs" variant="outline">
                    v{r.version}
                  </Badge>
                </Group>
                <Text fw={600} size="sm" truncate>
                  {r.name}
                </Text>
                <Group gap="md" mt={2}>
                  <Text c="dimmed" size="xs" truncate>
                    {r.relatedProcessStep || tr("関連工程なし")}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {r.itemCount}項目
                  </Text>
                </Group>
                {r.groupName && (
                  <Badge
                    color="gray"
                    size="xs"
                    style={{ alignSelf: "flex-start" }}
                    variant="light"
                  >
                    {r.groupName}
                  </Badge>
                )}
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
      <InspectionTemplateGroupModal
        onClose={() => setGroupModalOpen(false)}
        opened={groupModalOpen}
      />
      <InspectionTemplateIoModal
        onClose={() => {
          setIoOpen(false);
          setIoIds([]);
        }}
        opened={ioOpen}
        selectedIds={ioIds}
      />
    </ListShell>
  );
}
