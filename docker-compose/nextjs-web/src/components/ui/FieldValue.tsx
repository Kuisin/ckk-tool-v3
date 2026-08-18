/**
 * FieldValue.tsx — label/value display (_specs/design.md §10.1).
 */

import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function FieldValue({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value: ReactNode;
  /**
   * SummaryGrid の 1 行を丸ごと使う（備考など、狭い枠だと読めない値）。
   * 列数に依らず `1 / -1` で伸ばすので、モバイルの 1 列でも崩れない。
   */
  fullWidth?: boolean;
}) {
  return (
    <Stack gap={2} style={fullWidth ? { gridColumn: "1 / -1" } : undefined}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text component="div" fw={500} size="sm">
        {value ?? "—"}
      </Text>
    </Stack>
  );
}
