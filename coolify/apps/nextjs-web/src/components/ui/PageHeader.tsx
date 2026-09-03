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
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { usePreferences } from "@/components/layout/PreferencesProvider";
import { useIsMobile } from "@/hooks/useViewport";
import {
  categoryLabel,
  isAppCategory,
  workprocessHomeHref,
} from "@/lib/app-list";
import type { Locale } from "@/lib/i18n";

/** A breadcrumb: plain label, or a label that links to `href`. */
export type Crumb = string | { label: string; href?: string };

/**
 * パンくずは**表示のときに訳す**。以前は `ホーム` をモジュール定数に持っていて、
 * 表示言語を切り替えてもそこだけ日本語のまま残っていた（定数は読み込み時に 1 度
 * 評価されるので locale を見ようがない）。呼び出し側が渡してくるカテゴリ名も
 * ja の素の文字列なので、同じ場所で `categoryLabel()` に通す。
 *
 * ★ **文字列そのままのパンくず（`"販売"` のような素の文字列）はここでは
 * 訳せない。** 呼び出し元（各画面）が渡してくる**実行時の値**で、
 * next-intl の `t(key)` が受け付ける静的な鍵ではない——`tr()` に渡しても
 * 存在しない鍵として扱われるだけなので、ここでは翻訳を諦めてそのまま返す
 * （日本語のまま出るが、存在しない鍵の診断文字列が出るよりはましという
 * 判断）。カテゴリ名（`isAppCategory`）と `{ label, href }` 形は元から
 * 呼び出し元が管理する値なので対象外——実質、影響するのは画面ごとに
 * 直書きしているパンくず文字列（このパンくずが日本語のまま残る、という
 * 既知の課題）。各画面で `tr("画面の鍵")` を呼んでから渡す形に直すのが
 * 次の一手——ja を鍵にした旧 `ui` 辞書（`ui-text.ts`）を退役し、本物の
 * next-intl 鍵へ一括移行した経緯は `tools/i18n/README.md` を参照。
 */
function normalize(c: Crumb, locale: Locale): { label: string; href?: string } {
  if (typeof c !== "string") return { ...c, label: c.label };
  // 工程（カテゴリ）名の素のパンくずは、その工程で絞り込んだ Home へリンクする。
  if (isAppCategory(c))
    return { label: categoryLabel(c, locale), href: workprocessHomeHref(c) };
  return { label: c };
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
  const tr = useTranslations();
  const { locale } = usePreferences();
  const items = [
    { label: tr("ui.pageHeader.home"), href: "/" },
    ...breadcrumbs.map((c) => normalize(c, locale)),
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
        <Group align="end" className="min-w-0" gap="sm" wrap="nowrap">
          <Title className="min-w-0 flex-1 truncate" order={isMobile ? 3 : 2}>
            {title}
          </Title>
          {status && <span className="shrink-0">{status}</span>}
        </Group>
      </Stack>
      {actions}
    </Group>
  );
}
