"use client";

/**
 * InventoryBadge.tsx — 利用可能数 + 予約バッジ (_specs/design.md §12.7).
 *
 * available（利用可能数）を表示し、予約がある場合は Tooltip 付きの
 * オレンジバッジを並べる。
 */

import { Badge, Group, Text, Tooltip } from "@mantine/core";
import { useTranslations } from "next-intl";

export function InventoryBadge({
  available,
  reserved,
  unit,
}: {
  available: number;
  reserved: number;
  unit: string;
}) {
  const tr = useTranslations();
  return (
    <Group gap="xs" wrap="nowrap">
      <Text className="tabular-nums" size="sm">
        {available.toLocaleString("ja-JP")} {unit}
      </Text>
      {reserved > 0 && (
        <Tooltip
          label={tr("production.inventoryBadge.reservedTooltip", {
            reserved: reserved.toLocaleString("ja-JP"),
            unit,
          })}
        >
          <Badge color="orange" variant="light">
            {tr("production.inventoryBadge.reservedLabel", {
              reserved: reserved.toLocaleString("ja-JP"),
            })}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}
