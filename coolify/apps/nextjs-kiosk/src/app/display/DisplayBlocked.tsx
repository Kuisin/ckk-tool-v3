/**
 * 停止・失効した画面に出す案内。**リンクコードは出さない。**
 *
 * ここでコードを出すと、その場で登録し直せてしまう — 管理者が止めたはずの
 * 画面が自分で復活し、同じ実機のプロファイルが一覧に 2 つ並ぶ。
 * だから「どうすれば直るか」ではなく「止まっている」と伝えるに留め、
 * 再開の判断は管理画面に置く。
 *
 * 文言は I18nProvider（呼び出し元の page.tsx が盤面自身の locale で包む）から
 * 読む — 端末自体に設定できる表示言語がある（kiosk_devices.locale と同じ規約）。
 */

import { Center, Stack, Text, Title } from "@mantine/core";
import { useI18n } from "@/components/I18nProvider";
import type { DisplayAuthFailReason } from "@/lib/display-auth";
import type { KioskMessages } from "@/lib/i18n";

function messageFor(
  reason: DisplayAuthFailReason,
  blocked: KioskMessages["display"]["blocked"],
): string | undefined {
  if (reason === "DISABLED") return blocked.disabled;
  if (reason === "REVOKED") return blocked.revoked;
  return undefined;
}

export function DisplayBlocked({ reason }: { reason: DisplayAuthFailReason }) {
  const { m } = useI18n();
  return (
    <Center p="xl" style={{ flex: 1, height: "100dvh" }}>
      <Stack align="center" gap="md" maw={720}>
        <Title order={1} style={{ fontSize: "2.4rem" }}>
          {messageFor(reason, m.display.blocked) ??
            m.display.blocked.unavailable}
        </Title>
        <Text c="dimmed" size="xl" ta="center">
          {m.display.blocked.detail}
        </Text>
      </Stack>
    </Center>
  );
}
