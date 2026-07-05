/**
 * FieldValue.tsx — label/value display (_specs/design.md §10.1).
 */

import { Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export function FieldValue({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text component="div" fw={500} size="sm">
        {value ?? "—"}
      </Text>
    </Stack>
  );
}
