"use client";

/**
 * LookupTablesList — ルックアップ表の一覧（マスタペイン, 閲覧モード）。
 *
 * MasterListNav の共通リスト。行を選ぶと右ペイン（デスクトップ）または詳細
 * ページ（モバイル）へ遷移。表が多いため絞り込み付き。参照キーは id、表示名は
 * 多言語 { ja, en }。
 */

import { Text } from "@mantine/core";
import { CreateButton } from "@/components/ui/buttons";
import { MasterListNav } from "@/components/ui/MasterListNav";
import { useTr } from "@/hooks/useTr";
import { localized } from "@/lib/format";
import type { LookupTable } from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/lookups";

export function LookupTablesList({ tables }: { tables: LookupTable[] }) {
  const tr = useTr();
  return (
    <MasterListNav
      emptyMessage={tr("表がありません。「表を追加」から作成してください。")}
      searchable
      searchPlaceholder={tr("表名・ID で絞り込み...")}
      sections={[
        {
          items: tables.map((t) => ({
            href: `${BASE}/${encodeURIComponent(t.id)}`,
            searchText: `${localized(t.name)} ${t.id}`,
            label: (
              <Text fw={600} size="sm" truncate>
                {localized(t.name)}
              </Text>
            ),
            description: `lookup("${t.id}", …) · ${t.keyColumns.length}キー · ${t.rows.length}行`,
          })),
        },
      ]}
      toolbar={
        <CreateButton href={`${BASE}/new`}>{tr("表を追加")}</CreateButton>
      }
    />
  );
}
