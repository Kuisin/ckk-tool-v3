"use client";

/**
 * LookupTablesList — ルックアップ表の一覧（マスタペイン, 閲覧モード）。
 *
 * MasterDetailShell の左ペインに表示するコンパクトなナビリスト。行を選ぶと右ペイン
 * （デスクトップ）または詳細ページ（モバイル）へ遷移。参照キーは不変の id、表示名は
 * 多言語 { ja, en }。編集・削除・新規は詳細/新規ページで行う。
 */

import { Group, NavLink, Stack, Text, Title } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PrimaryButton } from "@/components/ui/buttons";
import { localized } from "@/lib/format";
import type { LookupTable } from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/lookups";

export function LookupTablesList({ tables }: { tables: LookupTable[] }) {
  const pathname = usePathname();
  return (
    <Stack gap="sm">
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Title order={5}>ルックアップ表</Title>
        <PrimaryButton
          href={`${BASE}/new`}
          leftSection={<IconPlus size={14} />}
        >
          新規
        </PrimaryButton>
      </Group>
      {tables.length === 0 ? (
        <Text c="dimmed" size="sm">
          表がありません。「新規」から作成してください。
        </Text>
      ) : (
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
      )}
    </Stack>
  );
}
