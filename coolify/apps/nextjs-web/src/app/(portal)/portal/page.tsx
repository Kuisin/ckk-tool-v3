/**
 * /portal — 取引先ポータルの入口。
 *
 * ここはまだログインの確認だけ。書類一覧・進捗・フォームは後続の PR で足す。
 */

import { Anchor, Card, Stack, Text, Title } from "@mantine/core";
import { PortalLogoutButton } from "@/components/portal/PortalLogoutButton";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  return (
    <Stack gap="md">
      <Title order={3}>取引先ポータル</Title>
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {gate.session.displayName} 様
          </Text>
          <Text c="dimmed" size="sm">
            自社宛の書類をご覧いただけます。
          </Text>
          <Anchor href="/portal/documents" size="sm">
            書類の一覧を開く
          </Anchor>
        </Stack>
      </Card>
      <PortalLogoutButton />
    </Stack>
  );
}
