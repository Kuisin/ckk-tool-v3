"use client";

/**
 * LookupTablesList — ルックアップ表の一覧（マスタペイン, 閲覧モード）。
 *
 * MasterDetailShell の左ペインに表示するコンパクトなナビリスト。行を選ぶと右ペイン
 * （デスクトップ）または詳細ページ（モバイル）へ遷移。ページ名・新規ボタンは上部の
 * 共通ヘッダーにあるため、ここでは一覧のみ。参照キーは id、表示名は多言語 { ja, en }。
 */

import { NavLink, Stack, Text } from "@mantine/core";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localized } from "@/lib/format";
import type { LookupTable } from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/lookups";

export function LookupTablesList({ tables }: { tables: LookupTable[] }) {
  const pathname = usePathname();
  if (tables.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        表がありません。「新規」から作成してください。
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {tables.map((t) => {
        const href = `${BASE}/${encodeURIComponent(t.id)}`;
        return (
          <NavLink
            active={pathname === href}
            component={Link}
            description={`${t.id} · ${t.keyColumns.length}キー · ${t.rows.length}行`}
            href={href}
            key={t.id}
            label={
              <Text fw={600} size="sm" truncate>
                {localized(t.name)}
              </Text>
            }
          />
        );
      })}
    </Stack>
  );
}
