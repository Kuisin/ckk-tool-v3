/**
 * /portal — 取引先ポータルの入口。
 *
 * **リンクの一覧ではなく、いまの状態を出す。** 以前は行き先が 3 本並ぶだけで、
 * 「見に行く価値があるか」は開いてみるまで判らなかった。ここで出すのは
 *   1. 進行中の注文が何件あるか（段ごとの内訳つき）
 *   2. 直近の書類 5 件
 *   3. 進行中の注文 5 件
 * の 3 つで、いずれも押せばその一覧・詳細へ入れる。
 *
 * 行き先そのものはヘッダー（PortalShell）が常に持っているので、ここでは
 * 繰り返さない。
 */

import { Anchor, Card, Group, Stack, Text, Title } from "@mantine/core";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PortalDocumentLinks } from "@/components/portal/PortalDocumentLinks";
import { PortalOrderTable } from "@/components/portal/PortalOrderTable";
import { PortalProgressCounts } from "@/components/portal/PortalProgressCounts";
import {
  listPortalDocuments,
  PORTAL_DOCUMENT_TYPES,
} from "@/lib/portal-documents";
import { requirePortalView } from "@/lib/portal-page";
import {
  listPortalOrderLines,
  summarizePortalOrders,
} from "@/lib/portal-progress";

export const dynamic = "force-dynamic";

/** ホームに並べる件数。全部を読ませる場所ではないので短く切る。 */
const PREVIEW_COUNT = 5;

export default async function PortalHomePage() {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const [orders, documentGroups] = await Promise.all([
    listPortalOrderLines(gate.session),
    Promise.all(
      PORTAL_DOCUMENT_TYPES.map((type) =>
        listPortalDocuments(gate.session, type),
      ),
    ),
  ]);

  const summary = summarizePortalOrders(orders);
  const activeOrders = orders
    .filter((o) => o.progress !== "DELIVERED" && o.progress !== "CANCELLED")
    .slice(0, PREVIEW_COUNT);
  // 種別をまたいで日付の新しい順に混ぜる（種別ごとの並びは一覧側にある）。
  const recentDocuments = documentGroups
    .flat()
    .sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""))
    .slice(0, PREVIEW_COUNT);

  const empty = orders.length === 0 && recentDocuments.length === 0;

  return (
    <Stack gap="lg">
      <Card padding="lg" radius="md" withBorder>
        <Stack gap="xs">
          <Title order={3}>
            {tr("portal.home.greeting", { name: gate.session.displayName })}
          </Title>
          <Text c="dimmed" size="sm">
            {tr("portal.page.youCanViewDocumentsAddressedTo")}
          </Text>
        </Stack>
      </Card>

      {empty ? (
        <Text c="dimmed" size="sm">
          {tr("portal.home.nothingToShow")}
        </Text>
      ) : null}

      {orders.length > 0 ? (
        <PortalProgressCounts
          active={summary.active}
          byProgress={summary.byProgress}
        />
      ) : null}

      {activeOrders.length > 0 ? (
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{tr("portal.home.activeOrders")}</Title>
            <Anchor component={Link} href="/portal/orders" size="sm">
              {tr("portal.home.viewAll")}
            </Anchor>
          </Group>
          <PortalOrderTable rows={activeOrders} />
        </Stack>
      ) : null}

      {recentDocuments.length > 0 ? (
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>{tr("portal.home.recentDocuments")}</Title>
            <Anchor component={Link} href="/portal/documents" size="sm">
              {tr("portal.home.viewAll")}
            </Anchor>
          </Group>
          <PortalDocumentLinks items={recentDocuments} />
        </Stack>
      ) : null}
    </Stack>
  );
}
