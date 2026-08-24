/**
 * InventoryBadge.tsx — 利用可能数 + 予約バッジ (_specs/design.md §12.7).
 *
 * available（利用可能数）を表示し、予約がある場合は Tooltip 付きの
 * オレンジバッジを並べる。
 */

import { Badge, Group, Text, Tooltip } from "@mantine/core";

export function InventoryBadge({
  available,
  reserved,
  unit,
}: {
  available: number;
  reserved: number;
  unit: string;
}) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text className="tabular-nums" size="sm">
        {available.toLocaleString("ja-JP")} {unit}
      </Text>
      {reserved > 0 && (
        <Tooltip label={`予約中: ${reserved.toLocaleString("ja-JP")} ${unit}`}>
          <Badge color="orange" variant="light">
            予約 {reserved.toLocaleString("ja-JP")}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}
