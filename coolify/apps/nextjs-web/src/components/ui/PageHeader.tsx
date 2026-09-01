"use client";

/**
 * PageHeader.tsx — title + breadcrumbs + actions (_specs/design.md §10.2, §8).
 *
 * Breadcrumbs hide on mobile; title drops from order 2 to order 3. Mobile does
 * not get its own back link here — AppHeader's back button (real browser
 * history) already covers it; a second one would just be the same action twice.
 *
 * Breadcrumb segments may be a plain string (non-link) or `{ label, href }`
 * (a Next.js link). A Home ("/") link is prepended automatically, and the last
 * segment always renders as plain text (it is the current page).
 */

import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { usePreferences } from "@/components/layout/PreferencesProvider";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import {
  categoryLabel,
  isAppCategory,
  workprocessHomeHref,
} from "@/lib/app-list";
import type { Locale } from "@/lib/i18n";
import type { Translate } from "@/lib/ui-text";

/** A breadcrumb: plain label, or a label that links to `href`. */
export type Crumb = string | { label: string; href?: string };

/**
 * パンくずは**表示のときに訳す**。以前は `ホーム` をモジュール定数に持っていて、
 * 表示言語を切り替えてもそこだけ日本語のまま残っていた（定数は読み込み時に 1 度
 * 評価されるので locale を見ようがない）。呼び出し側が渡してくるカテゴリ名も
 * ja の素の文字列なので、同じ場所で `categoryLabel()` に通す。
 */
function normalize(
  c: Crumb,
  locale: Locale,
  tr: Translate,
): { label: string; href?: string } {
  if (typeof c !== "string") return { ...c, label: tr(c.label) };
  // 工程（カテゴリ）名の素のパンくずは、その工程で絞り込んだ Home へリンクする。
  if (isAppCategory(c))
    return { label: categoryLabel(c, locale), href: workprocessHomeHref(c) };
  return { label: tr(c) };
}

export function PageHeader({
  breadcrumbs,
  title,
  status,
  actions,
  align = "flex-end",
}: {
  breadcrumbs: Crumb[];
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  align?: "flex-end" | "flex-start";
}) {
  const isMobile = useIsMobile();
  const tr = useTr();
  const { locale } = usePreferences();
  const items = [
    { label: tr("ホーム"), href: "/" },
    ...breadcrumbs.map((c) => normalize(c, locale, tr)),
  ];

  return (
    <Group align={align} justify="space-between" wrap="nowrap">
      <Stack className="min-w-0" gap={8}>
        {!isMobile && (
          <Breadcrumbs>
            {items.map((item, i) => {
              const isLast = i === items.length - 1;
              // Linkable only when it has an href and isn't the current page.
              return item.href && !isLast ? (
                <Anchor
                  c="dimmed"
                  component={Link}
                  href={item.href}
                  key={`${i}-${item.label}`}
                  size="sm"
                >
                  {item.label}
                </Anchor>
              ) : (
                <Text
                  c={isLast ? undefined : "dimmed"}
                  key={`${i}-${item.label}`}
                  size="sm"
                >
                  {item.label}
                </Text>
              );
            })}
          </Breadcrumbs>
        )}
        <Group align="end" gap="sm" wrap="nowrap">
          <Title className="whitespace-nowrap" order={isMobile ? 3 : 2}>
            {title}
          </Title>
          {status}
        </Group>
      </Stack>
      {actions}
    </Group>
  );
}
