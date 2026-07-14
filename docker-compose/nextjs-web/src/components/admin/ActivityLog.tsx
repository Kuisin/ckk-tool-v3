"use client";

/**
 * ActivityLog — 操作履歴 一覧（管理者向け・全レコード横断）。
 *
 * audit_logs をサーバーで取得し（listAuditEntries）、クライアント側で
 * 検索・操作種別・対象で絞り込む。各詳細画面の「履歴」タブと同じデータ源。
 */

import { Group, Select, Text, TextInput } from "@mantine/core";
import { IconHistory, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { ActivityEntry } from "@/lib/audit";

export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [table, setTable] = useState<string | null>(null);

  const actionOptions = useMemo(
    () =>
      [...new Set(entries.map((e) => e.action))].map((v) => ({
        value: v,
        label: v,
      })),
    [entries],
  );
  const tableOptions = useMemo(
    () =>
      [
        ...new Map(entries.map((e) => [e.tableName, e.tableLabel])).entries(),
      ].map(([value, label]) => ({ value, label })),
    [entries],
  );

  const reset = () => {
    setSearch("");
    setAction(null);
    setTable(null);
  };

  const filtered = entries.filter((e) => {
    const q = search.trim();
    const matchesSearch =
      !q ||
      (e.recordId?.includes(q) ?? false) ||
      e.user.includes(q) ||
      (typeof e.detail === "string" && e.detail.includes(q));
    const matchesAction = !action || e.action === action;
    const matchesTable = !table || e.tableName === table;
    return matchesSearch && matchesAction && matchesTable;
  });

  const columns: Column<ActivityEntry>[] = [
    {
      key: "at",
      header: "日時",
      width: 150,
      sortable: true,
      render: (e) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {e.at}
        </Text>
      ),
    },
    {
      key: "action",
      header: "操作",
      width: 80,
      sortable: true,
      render: (e) => <Text size="sm">{e.action}</Text>,
    },
    {
      key: "tableLabel",
      header: "対象",
      width: 100,
      sortable: true,
      render: (e) => <Text size="sm">{e.tableLabel}</Text>,
    },
    {
      key: "recordId",
      header: "レコード",
      width: 200,
      render: (e) => (
        <Text ff="mono" size="xs" truncate>
          {e.recordId ?? "—"}
        </Text>
      ),
    },
    {
      key: "user",
      header: "ユーザー",
      width: 120,
      sortable: true,
      render: (e) => <Text size="sm">{e.user}</Text>,
    },
    {
      key: "detail",
      header: "変更内容",
      render: (e) => (
        <Text c="dimmed" size="xs">
          {e.detail}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      breadcrumbs={["管理", "操作履歴"]}
      filters={
        <>
          <Select
            clearable
            data={actionOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setAction}
            placeholder="操作"
            value={action}
            w={isMobile ? undefined : 120}
          />
          <Select
            clearable
            data={tableOptions}
            flex={isMobile ? 1 : undefined}
            onChange={setTable}
            placeholder="対象"
            value={table}
            w={isMobile ? undefined : 140}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="レコード・ユーザー・内容で検索"
          value={search}
        />
      }
      title="操作履歴"
    >
      <DataTable
        columns={columns}
        data={filtered}
        defaultSort={{ key: "at", dir: "desc" }}
        emptyIcon={<IconHistory size={24} />}
        emptyMessage="操作履歴がありません"
        getRowId={(e) => String(e.id)}
        renderCard={(e) => (
          <Group align="flex-start" justify="space-between" wrap="nowrap">
            <div className="min-w-0">
              <Group gap="xs">
                <Text fw={600} size="sm">
                  {e.action}
                </Text>
                <Text c="dimmed" size="xs">
                  {e.tableLabel}
                </Text>
              </Group>
              <Text ff="mono" size="xs" truncate>
                {e.recordId ?? "—"}
              </Text>
              <Text c="dimmed" size="xs">
                {e.detail}
              </Text>
            </div>
            <div className="shrink-0 text-right">
              <Text c="dimmed" size="xs">
                {e.at}
              </Text>
              <Text size="xs">{e.user}</Text>
            </div>
          </Group>
        )}
      />
    </ListShell>
  );
}
