import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconTable } from "@tabler/icons-react";

export const dynamic = "force-dynamic";

/**
 * ルックアップ表 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default function LookupsIndexPage() {
  return (
    <Center mih={280}>
      <Stack align="center" gap="sm">
        <ThemeIcon color="gray" size="xl" variant="light">
          <IconTable size={24} />
        </ThemeIcon>
        <Text c="dimmed" size="sm">
          左の一覧から表を選択してください
        </Text>
      </Stack>
    </Center>
  );
}
