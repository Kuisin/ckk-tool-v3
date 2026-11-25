/**
 * /portal/orders/[number] — 注文明細 1 件。
 *
 * `[number]` は明細の id（`CKK~ORD-2026-00001-01`）。画面に出すのは番号
 * （`ORD-2026-00001-01`）だけで、法人コードは見せない。番号だけ・旧番号
 * （`ORD-202607-00001-01`）で開かれたときは、このアカウントに**見える**
 * 明細の中から探す: 1 件ならその URL へ送り、複数なら選ばせる。
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

import { Anchor, Card, Stack, Text, Title } from "@mantine/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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
import { getPortalOrderLine } from "@/lib/portal-progress";
import { portalOrderLineCandidates } from "../../doc-param";

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
  const { keys, canonical } = await portalOrderLineCandidates(number);

  // 候補は必ず getPortalOrderLine（= 認可）に通す。見えない明細は候補に
  // 無かったのと同じ（存在を漏らさない）。
  const visible = [];
  for (const k of keys) {
    const l = await getPortalOrderLine(gate.session, k);
    if (l) visible.push(l);
  }
  if (visible.length === 0) notFound();
  if (!canonical && visible.length === 1 && visible[0].id) {
    redirect(`/portal/orders/${encodeURIComponent(visible[0].id)}`);
  }
  if (visible.length > 1) {
    // 同じ番号の明細が複数見える（発行した法人が違う）。法人コードは出さず、
    // 品名と注文日で見分けてもらう。
    return (
      <Stack gap="md">
        <PortalBackLink
          href="/portal/orders"
          label={tr("common.orderProgress")}
        />
        <Text c="dimmed" ff="monospace" size="sm">
          {visible[0].number ?? visible[0].acceptanceNumber}
        </Text>
        <Stack gap="xs">
          {visible.map((l) => (
            <Anchor
              href={`/portal/orders/${encodeURIComponent(l.id ?? "")}`}
              key={l.id}
              size="sm"
              w="fit-content"
            >
              {[l.productName, l.orderedOn].filter(Boolean).join(" / ")}
            </Anchor>
          ))}
        </Stack>
      </Stack>
    );
  }
  const line = visible[0];

  // 画面に出すのは番号だけ。監査（portal_access_logs）には id を渡す —
  // 番号は法人ごとの連番で、番号だけでは明細が決まらない。
  const displayNumber = line.number ?? line.acceptanceNumber;

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: "order_lines",
    resourceId: line.id ?? displayNumber,
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
