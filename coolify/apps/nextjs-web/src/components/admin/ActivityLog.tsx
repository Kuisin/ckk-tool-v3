"use client";

/**
 * ActivityLog — 操作履歴 一覧（管理者向け・全レコード横断）。
 *
 * 絞り込み・ページング・並べ替えは**サーバー側**（`queryAuditEntries`）で
 * 行う — 以前は最新 300 件をクライアントへ持ってきて絞っていたので、
 * 300 件より古い履歴には絞り込みようがなかった（SY0D ログイン履歴と同じ
 * 理由で直した）。フィルタは URL search params に "server" モードで保持し、
 * 変えるたびにこの RSC 経由のページ（`app/(dashboard)/settings/activity/
 * page.tsx`）を再取得する。
 */

import { Badge, Group, Select, Stack, Text, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { IconDeviceTablet, IconHistory, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import {
  useUrlSelectState,
  useUrlStringState,
  useUrlTableState,
} from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { ActivityEntry } from "@/lib/audit";
import type { AuditQuery } from "@/lib/audit-filter-core";
import { labelKeys } from "@/lib/messages";

interface Props {
  entries: ActivityEntry[];
  total: number;
  query: AuditQuery;
  /** 絞り込みバーの「操作者」選択肢（全ユーザー — audit_logs の distinct ではない）。 */
  actors: { value: string; label: string }[];
}

export function ActivityLog({ entries, total, actors }: Props) {
  const tr = useTranslations();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // すべて "server" モード — URL を書き換えるたびにこの一覧の RSC を
  // 再取得する（SY0D と同じ理由。以前はここが client モードのままで、
  // フィルタを変えても表示が動かないという同じ穴があった）。
  const [search, setSearch] = useUrlStringState("q", "", "server");
  const [action, setAction] = useUrlSelectState("action", "server");
  const [table, setTable] = useUrlSelectState("table", "server");
  const [user, setUser] = useUrlSelectState("user", "server");
  const [from, setFrom] = useUrlSelectState("from", "server");
  const [to, setTo] = useUrlSelectState("to", "server");
  const urlTable = useUrlTableState("server");

  // 検索ボックスはキー入力のたびに RSC 往復させない — 入力を一旦ローカルに
  // 持って 400ms 落ち着いてから URL へ反映する。
  const [searchInput, setSearchInput] = useState(search);
  const [debouncedSearch] = useDebouncedValue(searchInput, 400);
  // biome-ignore lint/correctness/useExhaustiveDependencies: search（URL の現在値）・setSearch を意図的に外す — 外から search が変わったとき（reset 等）には追従しない一方向の同期
  useEffect(() => {
    if (debouncedSearch !== search) {
      startTransition(() => setSearch(debouncedSearch || null));
    }
  }, [debouncedSearch]);

  const actionOptions = labelKeys("audit.action").map((v) => ({
    value: v,
    label: tr(`audit.action.${v}`),
  }));
  const tableOptions = labelKeys("audit.table")
    .map((v) => ({ value: v, label: tr(`audit.table.${v}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ja"));

  const reset = () => {
    setSearchInput("");
    startTransition(() => {
      setSearch(null);
      setAction(null);
      setTable(null);
      setUser(null);
      setFrom(null);
      setTo(null);
      urlTable.setPage(1);
      urlTable.setSort(null);
    });
  };

  const columns: Column<ActivityEntry>[] = [
    {
      key: "at",
      header: tr("common.dateAndTime"),
      width: 150,
      // サーバー側で並べ替えに対応するのは created_at だけ（索引がある列）。
      sortable: true,
      render: (e) => (
        <Text c="dimmed" className="tabular-nums" size="xs">
          {e.at}
        </Text>
      ),
    },
    {
      key: "action",
      header: tr("common.actions"),
      width: 80,
      render: (e) => <Text size="sm">{e.action}</Text>,
    },
    {
      key: "tableLabel",
      header: tr("common.target"),
      width: 100,
      render: (e) => <Text size="sm">{e.tableLabel}</Text>,
    },
    {
      key: "recordId",
      header: tr("common.record"),
      width: 200,
      render: (e) => (
        <Text ff="mono" size="xs" truncate>
          {e.recordId ?? "—"}
        </Text>
      ),
    },
    {
      key: "user",
      header: tr("common.user"),
      width: 150,
      render: (e) => (
        <Stack gap={2}>
          <Text size="sm">{e.user}</Text>
          {/* 共有タブレットからの操作は端末名バッジを出す（Web 操作は無し）。 */}
          {e.device && (
            <Badge
              color="grape"
              leftSection={<IconDeviceTablet size={11} />}
              size="xs"
              variant="light"
            >
              {e.device}
            </Badge>
          )}
        </Stack>
      ),
    },
    {
      key: "summary",
      header: tr("common.whatChanges"),
      render: (e) => (
        <Text c="dimmed" size="xs">
          {e.summary}
        </Text>
      ),
    },
  ];

  return (
    <ListShell
      breadcrumbs={[tr("common.system"), tr("common.activityLog")]}
      filters={
        <>
          <DatePickerInput
            clearable
            flex={isMobile ? 1 : undefined}
            maxDate={to ?? undefined}
            onChange={(v) => startTransition(() => setFrom(v))}
            placeholder={tr("common.dateFrom")}
            type="default"
            value={from}
            valueFormat="YYYY/MM/DD"
            w={isMobile ? undefined : 160}
          />
          <DatePickerInput
            clearable
            flex={isMobile ? 1 : undefined}
            minDate={from ?? undefined}
            onChange={(v) => startTransition(() => setTo(v))}
            placeholder={tr("common.dateTo")}
            type="default"
            value={to}
            valueFormat="YYYY/MM/DD"
            w={isMobile ? undefined : 160}
          />
          <Select
            clearable
            data={actionOptions}
            flex={isMobile ? 1 : undefined}
            onChange={(v) => startTransition(() => setAction(v))}
            placeholder={tr("common.actions")}
            value={action}
            w={isMobile ? undefined : 130}
          />
          <Select
            clearable
            data={tableOptions}
            flex={isMobile ? 1 : undefined}
            onChange={(v) => startTransition(() => setTable(v))}
            placeholder={tr("common.target")}
            searchable
            value={table}
            w={isMobile ? undefined : 160}
          />
          <Select
            clearable
            data={actors}
            flex={isMobile ? 1 : undefined}
            onChange={(v) => startTransition(() => setUser(v))}
            placeholder={tr("common.user")}
            searchable
            value={user}
            w={isMobile ? undefined : 160}
          />
        </>
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearchInput(e.currentTarget.value)}
          placeholder={tr("admin.activityLog.searchByRecordOrUser")}
          value={searchInput}
        />
      }
      title={tr("common.activityLog")}
    >
      <DataTable
        columns={columns}
        data={entries}
        emptyIcon={<IconHistory size={24} />}
        emptyMessage={tr("admin.activityLog.thereIsNoActivity")}
        getRowId={(e) => String(e.id)}
        onRowClick={(e) => router.push(`/settings/activity/${e.id}`)}
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
                {e.summary}
              </Text>
            </div>
            <div className="shrink-0 text-right">
              <Text c="dimmed" size="xs">
                {e.at}
              </Text>
              <Text size="xs">{e.user}</Text>
              {e.device && (
                <Badge
                  color="grape"
                  leftSection={<IconDeviceTablet size={10} />}
                  mt={2}
                  size="xs"
                  variant="light"
                >
                  {e.device}
                </Badge>
              )}
            </div>
          </Group>
        )}
        totalCount={total}
        urlMode="server"
        urlState
      />
    </ListShell>
  );
}
