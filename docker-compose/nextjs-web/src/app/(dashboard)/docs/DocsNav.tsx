"use client";

/**
 * DocsNav — /docs のナビゲーション（言語切替 + セクション/ページのツリー）。
 * デスクトップのサイドバーとモバイルの Drawer の両方で使う。
 */

import { Anchor, Divider, Group, NavLink, Stack, Text } from "@mantine/core";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DOC_LANG_LABEL,
  DOCS_LANGS,
  DOCS_TREE,
  type DocLang,
  isDocLang,
} from "@/lib/docs-tree";
import { DocsSearch } from "./DocsSearch";
import styles from "./docs.module.css";

export function DocsNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const lang: DocLang = isDocLang(params.get("lang") ?? undefined)
    ? (params.get("lang") as DocLang)
    : "ja";

  return (
    <Stack gap="md">
      <DocsSearch full />
      <Group gap="xs">
        {DOCS_LANGS.map((l) => (
          <Anchor
            c={l === lang ? undefined : "dimmed"}
            component={Link}
            fw={l === lang ? 700 : 400}
            href={`${pathname}?lang=${l}`}
            key={l}
            onClick={onNavigate}
            size="xs"
          >
            {DOC_LANG_LABEL[l]}
          </Anchor>
        ))}
      </Group>
      <Divider />
      {DOCS_TREE.map((section) => (
        <Stack gap={2} key={section.title.en}>
          <Text c="dimmed" fw={700} px="xs" size="xs" tt="uppercase">
            {section.title[lang]}
          </Text>
          {section.pages.map((page) => (
            <NavLink
              active={pathname === `/docs/${page.slug}`}
              className={styles.navItem}
              component={Link}
              href={`/docs/${page.slug}?lang=${lang}`}
              key={page.slug}
              label={page.title[lang]}
              onClick={onNavigate}
              styles={{ label: { fontSize: "var(--mantine-font-size-sm)" } }}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
