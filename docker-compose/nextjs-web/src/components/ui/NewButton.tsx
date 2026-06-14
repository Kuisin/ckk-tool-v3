"use client";

/**
 * NewButton.tsx — list page 新規作成 CTA (_specs/design.md §8.1).
 *
 * Renders as a Next.js Link when `href` is given.
 */

import { Button } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/useViewport";

export function NewButton({
  label = "新規作成",
  href,
}: {
  label?: string;
  href?: string;
}) {
  const isMobile = useIsMobile();
  const common = {
    leftSection: <IconPlus size={16} />,
    size: "sm",
    style: { flexShrink: 0 },
  } as const;

  if (href) {
    return (
      <Button component={Link} href={href} {...common}>
        {isMobile ? "新規" : label}
      </Button>
    );
  }
  return <Button {...common}>{isMobile ? "新規" : label}</Button>;
}
