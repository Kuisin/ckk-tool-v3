"use client";

/**
 * NotFoundContent — 存在しないページのフォールバック表示。
 *
 * notFound() 呼び出し・未定義 URL の双方から表示される（(dashboard)/not-found
 * + キャッチオール経由）。ホームへ / 前のページへ戻る の 2 アクションを出す。
 * 遷移履歴が無い（直接アクセス等）場合は「前のページへ戻る」を隠す。
 */

import { Center, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconError404, IconHome } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";

export function NotFoundContent() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  // history はクライアントでのみ判定（SSR とのミスマッチ回避）。
  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, []);

  return (
    <Center py={80}>
      <Stack align="center" gap="md" maw={420}>
        <ThemeIcon color="gray" radius="xl" size={72} variant="light">
          <IconError404 size={40} />
        </ThemeIcon>
        <Title order={3}>ページが見つかりません</Title>
        <Text c="dimmed" size="sm" ta="center">
          URL が間違っているか、ページが移動・削除された可能性があります。
        </Text>
        <Stack gap="xs" mt="sm" w={240}>
          <PrimaryButton
            fullWidth
            href="/"
            leftSection={<IconHome size={16} />}
          >
            ホームへ戻る
          </PrimaryButton>
          {canGoBack && (
            <SecondaryButton
              fullWidth
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.back()}
            >
              前のページへ戻る
            </SecondaryButton>
          )}
        </Stack>
      </Stack>
    </Center>
  );
}
