/**
 * EmptyState.tsx — empty list placeholder (_specs/design.md §10.3).
 */

import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  message,
  action,
}: {
  icon: ReactNode;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Center py="xl">
      <Stack align="center" gap="sm">
        <ThemeIcon color="gray" size="xl" variant="light">
          {icon}
        </ThemeIcon>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
        {action}
      </Stack>
    </Center>
  );
}
