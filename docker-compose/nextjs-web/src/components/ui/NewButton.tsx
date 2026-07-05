"use client";

/**
 * NewButton.tsx — list page 新規作成 CTA (_specs/design.md §8.1).
 *
 * Thin wrapper over CreateButton (global button system) that shortens the label
 * to 「新規」 on mobile. Renders as a Next.js Link when `href` is given.
 */

import { useIsMobile } from "@/hooks/useViewport";
import { CreateButton } from "./buttons";

export function NewButton({
  label = "新規作成",
  href,
}: {
  label?: string;
  href?: string;
}) {
  const isMobile = useIsMobile();
  return (
    <CreateButton href={href} style={{ flexShrink: 0 }}>
      {isMobile ? "新規" : label}
    </CreateButton>
  );
}
