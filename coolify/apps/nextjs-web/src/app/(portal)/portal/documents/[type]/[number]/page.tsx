/**
 * /portal/documents/[type]/[number] — 書類 1 件。
 *
 * 認可は requirePortalView(target) が見る。**見えないものは 404**
 * （「権限がありません」だと、その書類が存在することを教えてしまう）。
 * 開いたことは portal_access_logs に残す。
 *
 * ■ 明細まで出す
 * 番号と合計だけでは「何の請求か」が判らず、PDF を開くまで中身が読めなかった
 * （PDF はモバイルの iframe では表示できないことがある — design.md §20.2）。
 * 明細は社外に出してよい 5 欄に畳んである（PortalLineItemDto）。
 * **納品書は include_price に従う** — 価格を載せない納品書には列ごと出さない。
 */

import { Anchor, Group, Stack, Text, Title } from "@mantine/core";
import { IconFileTypePdf } from "@tabler/icons-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  PortalBackLink,
  PortalFacts,
  PortalField,
  PortalLineItems,
  PortalRelatedDocuments,
} from "@/components/portal/PortalDetail";
import { parseDocKey } from "@/lib/doc-number";
import { formatMoney } from "@/lib/format";
import { recordPortalAccess } from "@/lib/portal-access-log";
import {
  getPortalDocument,
  isPortalDocumentType,
  portalDocumentLabel,
  portalTargetOf,
} from "@/lib/portal-documents";
import { requirePortalView } from "@/lib/portal-page";

export const dynamic = "force-dynamic";

export default async function PortalDocumentPage({
  params,
}: {
  params: Promise<{ type: string; number: string }>;
}) {
  const tr = await getTranslations();
  const { type, number } = await params;
  if (!isPortalDocumentType(type)) notFound();
  const key = parseDocKey(decodeURIComponent(number));
  if (!key) notFound();

  const target = await portalTargetOf(type, key.yearMonth, key.seq);
  // 存在しない書類も、見えない書類も同じ 404。
  const gate = await requirePortalView(target ?? undefined);
  if (!gate.ok) return gate.view;
  if (!target) notFound();

  const doc = await getPortalDocument(
    gate.session,
    type,
    key.yearMonth,
    key.seq,
  );
  if (!doc) notFound();

  const h = await headers();
  await recordPortalAccess({
    session: gate.session,
    resourceType: type,
    resourceId: doc.number,
    action: "VIEW",
    ipAddress: h.get("x-forwarded-for"),
    userAgent: h.get("user-agent"),
  });

  // 納品書は「価格を載せない」設定があり得る（include_price）。そのときは
  // 単価・金額の列を出さずに理由を 1 行で言う（空欄が並ぶより読める）。
  const priceOmitted = !doc.showsPrices;

  const money = (v: string | null) =>
    v ? formatMoney(Number(v), doc.currency) : "—";

  return (
    <Stack gap="md">
      <PortalBackLink
        href="/portal/documents"
        label={tr("portal.documents.document")}
      />

      <Stack gap={4}>
        <Title order={3}>{portalDocumentLabel(type, tr)}</Title>
        <Text c="dimmed" ff="monospace" size="sm">
          {doc.number}
        </Text>
      </Stack>

      <PortalFacts>
        <PortalField
          label={tr("common.date")}
          value={doc.issuedOn?.slice(0, 10) ?? "—"}
        />
        {doc.validUntil ? (
          <PortalField
            label={tr("common.validUntil2")}
            value={doc.validUntil}
          />
        ) : null}
        {doc.orderedOn ? (
          <PortalField label={tr("common.orderDate2")} value={doc.orderedOn} />
        ) : null}
        {doc.customerOrderRef ? (
          <PortalField
            label={tr("common.customerOrderRef")}
            mono
            value={doc.customerOrderRef}
          />
        ) : null}
        {doc.deliveredOn ? (
          <PortalField
            label={tr("common.deliveredDate")}
            value={doc.deliveredOn}
          />
        ) : null}
        {doc.billingPeriodFrom && doc.billingPeriodTo ? (
          <PortalField
            label={tr("common.billingPeriod")}
            value={`${doc.billingPeriodFrom} 〜 ${doc.billingPeriodTo}`}
          />
        ) : null}
        {doc.dueDate ? (
          <PortalField
            label={tr("portal.documents.dueDate")}
            value={doc.dueDate}
          />
        ) : null}
        {doc.subtotal ? (
          <PortalField
            label={tr("common.subtotal")}
            value={money(doc.subtotal)}
          />
        ) : null}
        {doc.taxAmount ? (
          <PortalField
            label={tr("portal.documents.taxAmount")}
            value={money(doc.taxAmount)}
          />
        ) : null}
        {doc.totalAmount ? (
          <PortalField
            label={tr("common.totalAmount")}
            value={money(doc.totalAmount)}
          />
        ) : null}
      </PortalFacts>

      {doc.hasPdf && doc.pdfFileId ? (
        <Anchor
          href={`/portal/api/file/${doc.pdfFileId}?doc=${type}&no=${encodeURIComponent(doc.number)}`}
          size="sm"
          target="_blank"
          w="fit-content"
        >
          <Group gap={4} wrap="nowrap">
            <IconFileTypePdf size={14} />
            {tr("common.openThePdf")}
          </Group>
        </Anchor>
      ) : null}

      <Stack gap="xs">
        <Title order={5}>{tr("common.lineItems")}</Title>
        {priceOmitted ? (
          <Text c="dimmed" size="xs">
            {tr("portal.documents.priceOmitted")}
          </Text>
        ) : null}
        <PortalLineItems items={doc.lineItems} showPrices={doc.showsPrices} />
      </Stack>

      <PortalRelatedDocuments related={doc.related} />
    </Stack>
  );
}
