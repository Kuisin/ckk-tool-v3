/**
 * /portal/orders — 自社の注文の進捗。
 *
 * 出すのは派生した射影だけ（portal-progress.ts）。工程・指示書番号・外注先は
 * 出さない。段階は 受注 / 製造中 / 出荷準備 / 出荷済み / 納品済み の 5 つ。
 */

import { Stack, Text, Title } from "@mantine/core";
import { PortalOrderTable } from "@/components/portal/PortalOrderTable";
import { requirePortalView } from "@/lib/portal-page";
import { listPortalOrderLines } from "@/lib/portal-progress";
import { getTr } from "@/lib/ui-text-server";

export const dynamic = "force-dynamic";

export default async function PortalOrdersPage() {
  const tr = await getTr();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const rows = await listPortalOrderLines(gate.session);

  return (
    <Stack gap="md">
      <Title order={3}>{tr("注文の進捗")}</Title>
      {rows.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("表示できる注文はありません。")}
        </Text>
      ) : (
        <PortalOrderTable rows={rows} />
      )}
    </Stack>
  );
}
