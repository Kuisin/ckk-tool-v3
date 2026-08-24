/**
 * MasterDetailPlaceholder — MasterDetailShell 右ペインの未選択プレースホルダ。
 *
 * デスクトップの index ルートで表示する（モバイルでは shell が一覧を出すため
 * 表示されない）。各セクションの index ページが共用する。
 */

import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import type { ReactNode } from "react";

export function MasterDetailPlaceholder({
  icon,
  message,
}: {
  icon: ReactNode;
  message: string;
}) {
  return (
    <Center mih={280}>
      <Stack align="center" gap="sm">
        <ThemeIcon color="gray" size="xl" variant="light">
          {icon}
        </ThemeIcon>
        <Text c="dimmed" size="sm">
          {message}
        </Text>
      </Stack>
    </Center>
  );
}
