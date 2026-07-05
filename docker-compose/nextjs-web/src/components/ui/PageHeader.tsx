"use client";

/**
 * PageHeader.tsx — title + breadcrumbs + actions (_specs/design.md §10.2, §8).
 *
 * Breadcrumbs hide on mobile; title drops from order 2 to order 3.
 *
 * Breadcrumb segments may be a plain string (non-link) or `{ label, href }`
 * (a Next.js link). A Home ("/") link is prepended automatically, and the last
 * segment always renders as plain text (it is the current page).
 */

import { Anchor, Breadcrumbs, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useViewport";

/** A breadcrumb: plain label, or a label that links to `href`. */
export type Crumb = string | { label: string; href?: string };

const HOME_CRUMB = { label: "ホーム", href: "/" };

function normalize(c: Crumb): { label: string; href?: string } {
  return typeof c === "string" ? { label: c } : c;
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
  const items = [HOME_CRUMB, ...breadcrumbs.map(normalize)];

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
