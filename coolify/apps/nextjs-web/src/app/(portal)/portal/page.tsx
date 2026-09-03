/**
 * /portal — 取引先ポータルの入口。
 *
 * ここはまだログインの確認だけ。書類一覧・進捗・フォームは後続の PR で足す。
 */

import { Anchor, Card, Stack, Text, Title } from "@mantine/core";
import { getTranslations } from "next-intl/server";
import { PortalLogoutButton } from "@/components/portal/PortalLogoutButton";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  return (
    <Stack gap="md">
      <Title order={3}>{tr("common.partnerPortal")}</Title>
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {gate.session.displayName} 様
          </Text>
          <Text c="dimmed" size="sm">
            {tr("portal.page.youCanViewDocumentsAddressedTo")}
          </Text>
          <Stack gap={4}>
            <Anchor href="/portal/documents" size="sm">
              {tr("portal.page.documentsQuoteOrderAcceptanceDeliveryNote")}
            </Anchor>
            <Anchor href="/portal/orders" size="sm">
              {tr("common.orderProgress")}
            </Anchor>
            <Anchor href="/portal/forms" size="sm">
              {tr("common.formResponses")}
            </Anchor>
          </Stack>
        </Stack>
      </Card>
      <PortalLogoutButton />
    </Stack>
  );
}
