"use client";

/**
 * MasterListNav — MasterDetailShell の左ペイン共通ナビリスト。
 *
 * SY02 の計算基準 / 工具種管理 / ルックアップ表などコレクション系設定が共用する。
 * 構成: ツールバー（追加ボタン等）→ 絞り込み（任意）→ セクション見出し付き
 * NavLink リスト。選択状態は pathname で判定。絞り込みは各 item の searchText
 * （なければ文字列 label）に対する部分一致。
 */

import { Group, NavLink, Stack, Text, TextInput } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

export type MasterNavItem = {
  href: string;
  label: ReactNode;
  /** 絞り込み対象テキスト。label が ReactNode のときは必ず指定する。 */
  searchText?: string;
  description?: ReactNode;
};

export type MasterNavSection = {
  /** セクション見出し（1 セクションのみなら省略可）。 */
  label?: string;
  items: MasterNavItem[];
  /** セクションが空のときに出す文言（省略時はセクションごと非表示）。 */
  emptyMessage?: string;
};

export function MasterListNav({
  sections,
  toolbar,
  searchable = false,
  searchPlaceholder = "絞り込み...",
  emptyMessage = "項目がありません。",
}: {
  sections: MasterNavSection[];
  /** リスト上部のアクション行（追加・並び替えボタン等）。 */
  toolbar?: ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** 全セクションが空（絞り込み含む）のときの文言。 */
  emptyMessage?: string;
}) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches = (item: MasterNavItem) => {
    if (!q) return true;
    const text =
      item.searchText ?? (typeof item.label === "string" ? item.label : "");
    return text.toLowerCase().includes(q);
  };

  const filtered = sections.map((sec) => ({
    ...sec,
    items: sec.items.filter(matches),
  }));
  const totalShown = filtered.reduce((n, s) => n + s.items.length, 0);

  return (
    <Stack gap="md">
      {toolbar && <Group gap="xs">{toolbar}</Group>}
      {searchable && (
        <TextInput
          aria-label="絞り込み"
          leftSection={<IconSearch size={14} />}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={searchPlaceholder}
          size="xs"
          value={query}
        />
      )}

      {totalShown === 0 ? (
        <Text c="dimmed" size="sm">
          {q ? "絞り込みに一致する項目がありません。" : emptyMessage}
        </Text>
      ) : (
        filtered.map(
          (sec, i) =>
            (sec.items.length > 0 || sec.emptyMessage) && (
              <Stack gap={2} key={sec.label ?? i}>
                {sec.label && (
                  <Text c="dimmed" fw={600} size="xs">
                    {sec.label}
                  </Text>
                )}
                {sec.items.length === 0 ? (
                  <Text c="dimmed" size="xs">
                    {sec.emptyMessage}
                  </Text>
                ) : (
                  sec.items.map((item) => (
                    <NavLink
                      active={pathname === item.href}
                      component={Link}
                      description={item.description}
                      href={item.href}
                      key={item.href}
                      label={item.label}
                    />
                  ))
                )}
              </Stack>
            ),
        )
      )}
    </Stack>
  );
}
