"use client";

/**
 * AppFlagsTable — アプリ ON/OFF 管理（/admin/apps）。
 *
 * appList の全アプリ × 環境（dev / main）の有効状態を Switch で切り替える。
 * 行が無い＝有効（デフォルト ON）。切替は setAppEnabled（feature_flags upsert +
 * 監査ログ）。main を OFF にすると本番のランチャー・ホーム・操作コード検索から
 * 消え、URL 直アクセスもガードされる。
 */

import { Badge, Select, Switch, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconApps, IconSearch } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAppEnabled } from "@/app/(dashboard)/admin/apps/actions";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { ListShell } from "@/components/ui/shells";
import { useUrlSelectState, useUrlStringState } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { AppEnv, AppFlagRow } from "@/lib/app-flags";
import { CATEGORY_COLORS } from "@/lib/app-list";

export function AppFlagsTable({ rows }: { rows: AppFlagRow[] }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [, startTransition] = useTransition();

  // 検索・フィルタは URL search params に保持（design.md §8.1 / ページ共有）
  const [search, setSearch] = useUrlStringState("q");
  const [category, setCategory] = useUrlSelectState("category");
  // 楽観更新: key = `${appKey}:${env}` → 切替後の値。
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const categoryOptions = [...new Set(rows.map((r) => r.category))].map(
    (c) => ({ value: c, label: c }),
  );

  const reset = () => {
    setSearch(null);
    setCategory(null);
  };

  const filtered = rows.filter((r) => {
    const q = search.trim();
    const matchesSearch =
      !q || r.label.includes(q) || r.operationCode.includes(q.toUpperCase());
    const matchesCategory = !category || r.category === category;
    return matchesSearch && matchesCategory;
  });

  const toggle = (row: AppFlagRow, env: AppEnv, enabled: boolean) => {
    setPending((p) => ({ ...p, [`${row.key}:${env}`]: enabled }));
    startTransition(async () => {
      const result = await setAppEnabled({ appKey: row.key, env, enabled });
      if (result.ok) {
        notifications.show({
          title: enabled ? "有効化しました" : "無効化しました",
          message: `${row.label} を ${env} で${enabled ? "表示" : "非表示"}にしました`,
          color: "green",
        });
        router.refresh();
      } else {
        setPending((p) => {
          const { [`${row.key}:${env}`]: _dropped, ...rest } = p;
          return rest;
        });
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const enabledValue = (row: AppFlagRow, env: AppEnv) =>
    pending[`${row.key}:${env}`] ?? row.enabled[env];

  const envSwitch = (env: AppEnv) => ({
    key: env,
    header: env === "dev" ? "dev（検証）" : "main（本番）",
    width: 130,
    render: (r: AppFlagRow) => (
      <Switch
        aria-label={`${r.label} を ${env} で有効化`}
        checked={enabledValue(r, env)}
        color={env === "main" ? "blue" : "teal"}
        onChange={(e) => toggle(r, env, e.currentTarget.checked)}
        onClick={(e) => e.stopPropagation()}
        size="sm"
      />
    ),
  });

  const columns: Column<AppFlagRow>[] = [
    {
      key: "category",
      header: "カテゴリ",
      width: 110,
      sortable: true,
      sortValue: (r) => r.category,
      render: (r) => (
        <Badge
          color={CATEGORY_COLORS[r.category as keyof typeof CATEGORY_COLORS]}
          size="sm"
          variant="light"
        >
          {r.category}
        </Badge>
      ),
    },
    {
      key: "label",
      header: "アプリ",
      sortable: true,
      sortValue: (r) => r.label,
      render: (r) => (
        <Text fw={500} size="sm">
          {r.label}
        </Text>
      ),
    },
    {
      key: "operationCode",
      header: "操作コード",
      width: 110,
      sortable: true,
      sortValue: (r) => r.operationCode,
      render: (r) => (
        <Text ff="mono" size="sm">
          {r.operationCode}
        </Text>
      ),
    },
    envSwitch("dev"),
    envSwitch("main"),
  ];

  return (
    <ListShell
      breadcrumbs={["管理", "アプリ管理"]}
      filters={
        <Select
          clearable
          data={categoryOptions}
          onChange={setCategory}
          placeholder="カテゴリ"
          value={category}
          w={isMobile ? 120 : 140}
        />
      }
      onReset={reset}
      search={
        <TextInput
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setSearch(e.currentTarget.value)}
          placeholder="アプリ名・操作コードで検索"
          value={search}
        />
      }
      title="アプリ管理"
    >
      <DataTable
        columns={columns}
        data={filtered}
        emptyIcon={<IconApps size={24} />}
        emptyMessage="アプリがありません"
        getRowId={(r) => r.key}
        urlState
      />
    </ListShell>
  );
}
