"use client";

/**
 * ActiveBadge.tsx — boolean 有効/無効 badge (_specs/design.md §14).
 */

import { Badge } from "@mantine/core";
import { useTranslations } from "next-intl";

export function ActiveBadge({ active }: { active: boolean }) {
  const tr = useTranslations();
  return (
    <Badge color={active ? "green" : "gray"} variant="light">
      {active ? tr("common.enabled") : tr("common.disabled")}
    </Badge>
  );
}
