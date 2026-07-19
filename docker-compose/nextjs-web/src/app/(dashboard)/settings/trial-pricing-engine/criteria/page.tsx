import { Center, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconMathFunction } from "@tabler/icons-react";

export const dynamic = "force-dynamic";

/**
 * 計算基準 index — デスクトップ右ペインのプレースホルダ。
 * モバイルでは MasterDetailShell が一覧（master）を表示するため、これは出ない。
 */
export default function CriteriaIndexPage() {
  return (
    <Center mih={280}>
      <Stack align="center" gap="sm">
        <ThemeIcon color="gray" size="xl" variant="light">
          <IconMathFunction size={24} />
        </ThemeIcon>
        <Text c="dimmed" size="sm">
          左の一覧から基準を選ぶと式を編集できます
        </Text>
      </Stack>
    </Center>
  );
}
