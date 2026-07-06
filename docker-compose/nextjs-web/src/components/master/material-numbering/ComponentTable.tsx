"use client";

/**
 * ComponentTable.tsx — 採番構成 (MS0C) の汎用構成要素テーブル。
 *
 * コード / 名称 / 追加列 / 状態 / 更新日 + 有効・無効切替。削除は提供しない
 * （コードは材種・素材コードに埋め込まれるため）。
 */

import { Group, Paper, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleMinus, IconHash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  type ComponentTableKind,
  setComponentActive,
} from "@/app/(dashboard)/master/material-numbering/actions";
import { ActiveBadge } from "@/components/ui/ActiveBadge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { DocNumber } from "@/components/ui/DocNumber";
import { openConfirm } from "@/components/ui/modals";
import { formatDate } from "@/lib/format";

export interface ComponentRow {
  code: string;
  /** grade → manufacturerCode / kind → shapeCode（他は undefined）。 */
  parentCode?: string;
  parentLabel?: string;
  name: string;
  extra?: string;
  isActive: boolean;
  updatedAt: string;
}

export function ComponentTable({
  kind,
  rows,
  parentHeader,
  extraHeader,
}: {
  kind: ComponentTableKind;
  rows: ComponentRow[];
  /** 親列の見出し（grade=メーカー, kind=形状）。 */
  parentHeader?: string;
  /** 追加列の見出し（直径=φmm, 全長=mm など）。 */
  extraHeader?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const toggle = (row: ComponentRow) => {
    const next = !row.isActive;
    openConfirm({
      title: next ? "有効化の確認" : "無効化の確認",
      message: next
        ? `「${row.code} — ${row.name}」を有効化します。`
        : `「${row.code} — ${row.name}」を無効化します。新規の材種・素材作成で選択できなくなります（既存コードには影響しません）。`,
      confirmLabel: next ? "有効化する" : "無効化する",
      onConfirm: () => {
        startTransition(async () => {
          const res = await setComponentActive({
            kind,
            code: row.code,
            parentCode: row.parentCode,
            isActive: next,
          });
          if (res.ok) {
            notifications.show({
              title: next ? "有効化しました" : "無効化しました",
              message: `「${row.code}」を${next ? "有効化" : "無効化"}しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: res.error,
              color: "red",
            });
          }
        });
      },
    });
  };

  const columns: Column<ComponentRow>[] = [
    ...(parentHeader
      ? [
          {
            key: "parent",
            header: parentHeader,
            width: 140,
            sortable: true,
            sortValue: (r: ComponentRow) => r.parentCode ?? "",
            render: (r: ComponentRow) => r.parentLabel ?? r.parentCode ?? "—",
          },
        ]
      : []),
    {
      key: "code",
      header: "コード",
      sortable: true,
      width: 100,
      render: (r) => <DocNumber>{r.code}</DocNumber>,
    },
    {
      key: "name",
      header: "名称",
      sortable: true,
      sortValue: (r) => r.name,
      render: (r) => r.name,
    },
    ...(extraHeader
      ? [
          {
            key: "extra",
            header: extraHeader,
            width: 120,
            sortable: true,
            sortValue: (r: ComponentRow) => r.extra ?? "",
            render: (r: ComponentRow) => r.extra ?? "—",
          },
        ]
      : []),
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
      width: 110,
      render: (r) => formatDate(r.updatedAt),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      defaultSort={{ key: "code", dir: "asc" }}
      emptyIcon={<IconHash size={24} />}
      emptyMessage="構成要素がありません"
      getRowId={(r) => `${r.parentCode ?? ""}:${r.code}`}
      pageSize={20}
      renderCard={(r) => (
        <Paper p="sm" radius="sm" withBorder>
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <Stack gap={3} style={{ minWidth: 0 }}>
              <DocNumber c="dimmed">
                {r.parentCode ? `${r.parentCode} / ` : ""}
                {r.code}
              </DocNumber>
              <Text fw={600} size="sm" truncate>
                {r.name}
              </Text>
              {r.extra && (
                <Text c="dimmed" size="xs">
                  {r.extra}
                </Text>
              )}
            </Stack>
            <ActiveBadge active={r.isActive} />
          </Group>
        </Paper>
      )}
      rowActions={(row) => [
        {
          label: row.isActive ? "無効化" : "有効化",
          icon: <IconCircleMinus size={14} />,
          onAction: toggle,
        },
      ]}
    />
  );
}
