/**
 * 停止・失効した画面に出す案内。**リンクコードは出さない。**
 *
 * ここでコードを出すと、その場で登録し直せてしまう — 管理者が止めたはずの
 * 画面が自分で復活し、同じ実機のプロファイルが一覧に 2 つ並ぶ。
 * だから「どうすれば直るか」ではなく「止まっている」と伝えるに留め、
 * 再開の判断は管理画面に置く。
 *
 * 文字は ja 固定（ログイン前の画面と同じ規約 — 壁の画面に利用者は居ない）。
 */

import { Center, Stack, Text, Title } from "@mantine/core";
import type { DisplayAuthFailReason } from "@/lib/display-auth";

const MESSAGE: Partial<Record<DisplayAuthFailReason, string>> = {
  DISABLED: "この画面は一時停止されています。",
  REVOKED: "この画面の登録は取り消されました。",
};

export function DisplayBlocked({ reason }: { reason: DisplayAuthFailReason }) {
  return (
    <Center p="xl" style={{ flex: 1, height: "100dvh" }}>
      <Stack align="center" gap="md" maw={720}>
        <Title order={1} style={{ fontSize: "2.4rem" }}>
          {MESSAGE[reason] ?? "この画面は使用できません。"}
        </Title>
        <Text c="dimmed" size="xl" ta="center">
          再び使うには、管理画面（端末管理 →
          ディスプレイ）から操作してください。 この画面では登録し直せません。
        </Text>
      </Stack>
    </Center>
  );
}
