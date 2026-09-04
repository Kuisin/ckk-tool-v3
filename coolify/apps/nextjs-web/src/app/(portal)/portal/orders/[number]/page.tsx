/**
 * /portal/orders/[number] — 注文明細 1 件（`ORD-YYYYMM-NNNNN-NN`）。
 *
 * 一覧は「いまどの段か」しか言わないので、1 件ぶんの数量・単価・納期・
 * 出荷日と、そこから辿れる書類をここへ集める。**工程の中身は出さない**
 * （社外に出す進捗は 5 段だけ — lib/portal-progress-core.ts）。
 *
 * 認可は注文請書の側にある（注文明細は請書の行）ので、
 * `getPortalOrderLine` が `portalAccessFor` を通す。見えない／存在しないは
 * どちらも 404 —— 区別すると「その注文は在る」を教えてしまう。
 * 開いたことは portal_access_logs に残す。
 */

import { Card, Stack, Text, Title } from "@mantine/core";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  PortalBackLink,
  PortalFacts,
  PortalField,
  PortalRelatedDocuments,
} from "@/components/portal/PortalDetail";
import { PortalProgressSteps } from "@/components/portal/PortalProgress";
import { formatMoney } from "@/lib/format";
import { recordPortalAccess } from "@/lib/portal-access-log";
import { requirePortalView } from "@/lib/portal-page";
import {
  getPortalOrderLine,
  parsePortalOrderLineNumber,
  portalOrderLineNumber,
} from "@/lib/portal-progress";

export const dynamic = "force-dynamic";

export default async function PortalOrderLinePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const tr = await getTranslations();
  const gate = await requirePortalView();
  if (!gate.ok) return gate.view;

  const { number } = await params;
  const key = parsePortalOrderLineNumber(decodeURIComponent(number));
  if (!key) notFound();

  const line = await getPortalOrderLine(
    gate.session,
    key.yearMonth,
    key.seq,
    key.branch,
  );
  if (!line) notFound();

  const displayNumber =
    portalOrderLineNumber(line.acceptanceNumber, line.branch) ??
    line.acceptanceNumber;

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: "order_lines",
    resourceId: displayNumber,
    action: "VIEW",
    ipAddress: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });

  return (
    <Stack gap="md">
      <PortalBackLink
        href="/portal/orders"
        label={tr("common.orderProgress")}
      />

      <Stack gap={4}>
        <Title order={3}>{line.productName}</Title>
        <Text c="dimmed" ff="monospace" size="sm">
          {displayNumber}
        </Text>
      </Stack>

      <Card padding="lg" radius="md" withBorder>
        <PortalProgressSteps progress={line.progress} />
      </Card>

      <PortalFacts>
        <PortalField
          label={tr("common.quantity")}
          value={line.quantity.toLocaleString("ja-JP")}
        />
        <PortalField
          label={tr("common.deliveryDate")}
          value={line.deliveryDate ?? "—"}
        />
        <PortalField
          label={tr("common.unitPrice")}
          value={line.unitPrice ? formatMoney(Number(line.unitPrice)) : "—"}
        />
        <PortalField
          label={tr("common.amount")}
          value={line.amount ? formatMoney(Number(line.amount)) : "—"}
        />
        <PortalField
          label={tr("common.orderDate2")}
          value={line.orderedOn ?? "—"}
        />
        <PortalField
          label={tr("common.shippedDate")}
          value={line.shippedOn ?? "—"}
        />
        {line.customerOrderRef ? (
          <PortalField
            label={tr("common.customerOrderRef")}
            mono
            value={line.customerOrderRef}
          />
        ) : null}
      </PortalFacts>

      <PortalRelatedDocuments related={line.related} />
    </Stack>
  );
}
