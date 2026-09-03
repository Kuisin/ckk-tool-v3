"use client";

/**
 * QuoteDetail — 見積書 詳細 (design.md §8.2).
 *
 * Summary grid + 手続き状況 (ProcedurePanel — 下書き→発行→受諾、価格表 ← /
 * 注文請書 →) + tabs: 明細 (価格表 tier-resolved lines + 値引き + 適用価格表) /
 * PDF (発行時に保存された PDF のメタ + インライン A4 プレビュー) / 関連 (価格試算・
 * 価格表 back-links) / 履歴. 発行 (DRAFT → ISSUED) generates the PDF via the
 * Gotenberg route and stores it in SeaweedFS; the PDF tab streams that stored
 * copy. Backed by sales.quotes via the server page; 発行 persists through the
 * issueQuote Server Action.
 */

import { Anchor, Badge, Stack, Table, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCopy,
  IconDownload,
  IconRuler2,
  IconSend,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { issueQuote } from "@/app/(dashboard)/sales/quotes/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DesignRequestLinks } from "@/components/sales/design-requests/DesignRequestLinks";
import type { DesignRequestLink } from "@/components/sales/design-requests/model";
import type { AcceptanceLink } from "@/components/sales/order-acceptances/model";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  PdfAttachmentPanel,
  type PdfFileMeta,
} from "@/components/ui/PdfAttachmentPanel";
import {
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import { downloadFile } from "@/lib/download";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import { statusLabel } from "@/lib/status-map";
import { entrySummary, type PriceListEntry } from "../price-lists/model";
import { IssueQuoteModal } from "./IssueQuoteModal";
import {
  findPriceTierRefIn,
  orderTypeLabel,
  type Quote,
  quoteTotals,
} from "./model";

const BASE_PATH = "/sales/quotes";

export function QuoteDetail({
  quote,
  pdfMeta,
  relatedEntries,
  auditEntries,
  memos,
  designRequests = [],
  acceptances = [],
}: {
  quote: Quote;
  /** この見積に紐づく設計依頼（§10 — 関連タブの逆リンク）。 */
  designRequests?: DesignRequestLink[];
  /** 保管済み PDF のメタ（SeaweedFS 由来。未生成なら null）。 */
  pdfMeta: PdfFileMeta | null;
  /** この見積の明細 tier が属する価格表エントリ（関連タブ・適用価格表）。 */
  relatedEntries: PriceListEntry[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
  /** この見積から起きた注文請書（手続き状況の「次の書類へ」）。 */
  acceptances?: AcceptanceLink[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const totals = quoteTotals(quote);

  const status = quote.status;
  // PDF は発行後のみ閲覧できる（ルート側も 403 で拒否する）。
  const canViewPdf = status !== "DRAFT";
  const pdfFilename = `${quote.quoteNumber}.pdf`;
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(pdfMeta);
  const [issueOpen, setIssueOpen] = useState(false);
  // Bumped on 再生成 so the preview iframe reloads the regenerated PDF.
  const [pdfNonce, setPdfNonce] = useState(0);

  const pdfUrl = (extra = "") =>
    `/api/pdf/quote?id=${encodeURIComponent(quote.id)}${extra}`;

  // ── 手続き状況（下書き → 発行 → 受諾）───────────────────────────────────
  // 却下・期限切れは「受諾」段で止まった状態。段を増やさず色で示す
  // （_specs/design.md §9 の REJECTED = red / EXPIRED = orange）。
  const settled = status === "ACCEPTED" || status === "REJECTED";
  const stages: ProcedureStage[] = [
    {
      key: "draft",
      label: tr("common.draft"),
      description: fmt.date(quote.createdAt),
      loading: status === "DRAFT",
    },
    {
      key: "issued",
      label: tr("common.issue"),
      description:
        status === "DRAFT"
          ? tr("sales.quoteDetail.issuePdfDesc")
          : tr("common.issued2"),
      loading: status === "ISSUED",
    },
    {
      key: "accepted",
      label: tr("sales.quotes.accept"),
      description:
        status === "REJECTED"
          ? tr("sales.quoteDetail.rejected")
          : status === "EXPIRED"
            ? tr("sales.quoteDetail.expiredOn", {
                date: fmt.date(quote.validUntil),
              })
            : status === "ACCEPTED"
              ? tr("sales.quotes.toTheOrder")
              : quote.validUntil
                ? tr("sales.quoteDetail.validUntilLabel", {
                    date: fmt.date(quote.validUntil),
                  })
                : tr("sales.quotes.toTheOrder"),
      color:
        status === "REJECTED"
          ? "red"
          : status === "EXPIRED"
            ? "orange"
            : undefined,
    },
  ];
  const active =
    status === "DRAFT" ? 0 : settled || status === "EXPIRED" ? 2 : 1;

  // 上流 = 明細の単価を引いた価格表（見積書は価格表からしか値を持たない）。
  const sourceGroups: HandoffGroup[] | undefined =
    relatedEntries.length > 0
      ? [
          {
            key: "price-lists",
            title: tr("common.priceList"),
            summary: tr("common.itemsCount", { count: relatedEntries.length }),
            items: relatedEntries.map((e) => ({
              key: e.entryId,
              label: `${e.customerName} × ${e.productName}`,
              href: `/sales/price-lists/${e.entryId}`,
              note: tr("sales.quotes.whereTheUnitPriceCameFrom"),
            })),
            emptyNote: "—",
          },
        ]
      : undefined;

  // 下流 = この見積から起きた注文請書（1 見積から複数回受注し得る）。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "order-acceptances",
      title: tr("common.orderAcceptance"),
      summary:
        acceptances.length > 0
          ? tr("common.itemsCount", { count: acceptances.length })
          : null,
      items: acceptances.map((a) => ({
        key: a.number,
        label: a.number,
        href: `/sales/order-acceptances/${a.number}`,
        done: a.status === "COMPLETED" || a.status === "ARCHIVED",
        note:
          a.orderLineCount > 0
            ? tr("sales.quoteDetail.acceptanceNoteWithLines", {
                status: statusLabel("OrderAcceptanceIntake", a.status),
                count: a.orderLineCount,
              })
            : statusLabel("OrderAcceptanceIntake", a.status),
      })),
      emptyNote:
        status === "ACCEPTED"
          ? tr("sales.quotes.noOrderYetNoOrderAcceptance")
          : tr("sales.quotes.noOrderYetTheOrderAcceptance"),
    },
  ];

  const regenerate = async () => {
    try {
      const res = await fetch(pdfUrl("&force=1"));
      if (!res.ok) throw new Error(`PDF route ${res.status}`);
      const blob = await res.blob();
      setPdfFile({
        sizeBytes: blob.size,
        generatedAt: new Date().toISOString(),
      });
      setPdfNonce((n) => n + 1);
      notifications.show({
        title: tr("common.regenerated"),
        message: tr("common.pDFRegeneratedAndSaved"),
        color: "green",
      });
    } catch {
      notifications.show({
        title: tr("common.error2"),
        message: tr("common.couldNotRegenerateThePdf"),
        color: "red",
      });
    }
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...(status === "DRAFT"
              ? [
                  {
                    label: tr("common.issue"),
                    icon: <IconSend size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            // PDF は発行後のみ（未発行はルートも 403）。
            ...(canViewPdf
              ? [
                  {
                    label: tr("common.downloadThePdf"),
                    icon: <IconDownload size={14} />,
                    onClick: () =>
                      void downloadFile(pdfUrl("&download=1"), pdfFilename),
                  },
                ]
              : []),
            // §10 設計依頼は「唯一の次の一歩」ではなく任意の側枝なので、
            // NextStepCard ではなくメニュー項目に置く。
            {
              label: tr("common.raiseADesignRequest"),
              icon: <IconRuler2 size={14} />,
              disabled: status === "REJECTED" || status === "EXPIRED",
              disabledReason: tr("sales.quotes.youCannotRaiseThisFromA"),
              onClick: () =>
                router.push(
                  `/sales/design-requests/new?quote=${encodeURIComponent(quote.quoteNumber)}`,
                ),
            },
            {
              label: tr("common.duplicate"),
              icon: <IconCopy size={14} />,
              divider: true,
              onClick: () => router.push(`${BASE_PATH}/new?from=${quote.id}`),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${quote.id}/edit`)}
          pdf={canViewPdf ? { href: pdfUrl() } : undefined}
        />
      }
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.quote"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(quote.createdAt)}
      status={<StatusBadge entity="Quote" status={status} />}
      title={quote.quoteNumber}
      updatedAt={fmt.dateTime(quote.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label={tr("common.customer")} value={quote.customerName} />
        <FieldValue
          label={tr("sales.quotes.branch")}
          value={quote.customerBranchName}
        />
        <FieldValue label={tr("common.salesRep")} value={quote.salesRepName} />
        <FieldValue label={tr("common.createdBy")} value={quote.createdBy} />
        <FieldValue
          label={tr("common.validUntil2")}
          value={fmt.date(quote.validUntil)}
        />
        <FieldValue
          label={tr("common.lineCount")}
          value={tr("sales.quoteDetail.itemCountNoSpace", {
            count: quote.items.length,
          })}
        />
        <FieldValue
          label={tr("common.totalAmountInclTax")}
          value={<MoneyText ta="left" value={totals.grandTotal} />}
        />
      </SummaryGrid>

      <ProcedurePanel
        active={active}
        handoffGroups={handoffGroups}
        sourceGroups={sourceGroups}
        stages={stages}
      />

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">{tr("common.lineItems")}</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="memo">{tr("common.memo")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={860}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.product")}</Table.Th>
                  <Table.Th>{tr("common.orderType")}</Table.Th>
                  <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                  <Table.Th ta="right">{tr("common.unitPrice")}</Table.Th>
                  <Table.Th ta="right">{tr("common.discount")}</Table.Th>
                  <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                  <Table.Th>{tr("common.deliveryDate")}</Table.Th>
                  <Table.Th>{tr("sales.quotes.priceListApplied")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {quote.items.map((it) => {
                  const tierRef = findPriceTierRefIn(
                    relatedEntries,
                    it.priceTierId,
                    tr,
                  );
                  return (
                    <Table.Tr key={it.id}>
                      <Table.Td>
                        <Text size="sm">{it.productName}</Text>
                        <Text c="dimmed" ff="mono" size="xs">
                          {it.productId}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge color="gray" variant="light">
                          {orderTypeLabel(it.orderType)}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">{it.quantity}</Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={it.unitPrice} />
                      </Table.Td>
                      <Table.Td ta="right">
                        {it.discountAmount > 0 ? (
                          <>
                            <Text
                              c="red"
                              className="tabular-nums"
                              ff="mono"
                              size="sm"
                            >
                              -<MoneyText value={it.discountAmount} />
                            </Text>
                            {it.discountLabel && (
                              <Text c="dimmed" size="xs">
                                {it.discountLabel}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text c="dimmed" size="sm">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={it.amount} />
                      </Table.Td>
                      <Table.Td>{fmt.date(it.deliveryDate)}</Table.Td>
                      <Table.Td>
                        {tierRef ? (
                          <Text className="tabular-nums" ff="mono" size="xs">
                            {tierRef.label}
                          </Text>
                        ) : (
                          <Text c="orange" size="xs">
                            {tr("common.noPriceList")}
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={5} ta="right">
                    <Text c="dimmed" size="sm">
                      {tr("common.subtotal")}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.subtotal} />
                  </Table.Td>
                  <Table.Td colSpan={2} />
                </Table.Tr>
                <Table.Tr>
                  <Table.Td colSpan={5} ta="right">
                    <Text c="dimmed" size="sm">
                      {tr("sales.quotes.tax10")}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.tax} />
                  </Table.Td>
                  <Table.Td colSpan={2} />
                </Table.Tr>
                <Table.Tr>
                  <Table.Td colSpan={5} ta="right">
                    <Text fw={700} size="sm">
                      {tr("sales.quotes.totalInclTax")}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.grandTotal} />
                  </Table.Td>
                  <Table.Td colSpan={2} />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="pdf">
          <PdfAttachmentPanel
            downloadHref={pdfUrl("&download=1")}
            emptyAction={
              status === "DRAFT" ? (
                <PrimaryButton
                  leftSection={<IconSend size={14} />}
                  onClick={() => setIssueOpen(true)}
                >
                  {tr("common.issue")}
                </PrimaryButton>
              ) : undefined
            }
            emptyMessage={tr("common.thePdfBecomesAvailableOnceIt")}
            file={pdfFile}
            filename={pdfFilename}
            onRegenerate={regenerate}
            previewSrc={canViewPdf ? pdfUrl(`&v=${pdfNonce}`) : undefined}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.designRequest")}
              </Text>
              <DesignRequestLinks
                createDisabledReason={
                  status === "REJECTED" || status === "EXPIRED"
                    ? tr("sales.quotes.youCannotRaiseThisFromA")
                    : undefined
                }
                createHref={`/sales/design-requests/new?quote=${encodeURIComponent(quote.quoteNumber)}`}
                links={designRequests}
              />
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("sales.quotes.priceListApplied")}
              </Text>
              {relatedEntries.length > 0 ? (
                <Stack gap={4}>
                  {relatedEntries.map((e) => (
                    <Anchor
                      key={e.entryId}
                      onClick={() =>
                        router.push(`/sales/price-lists/${e.entryId}`)
                      }
                      size="sm"
                    >
                      {e.customerName} × {e.productName}（
                      {tr("sales.quoteDetail.orderTypesAndTierCount", {
                        orderTypes: e.variants
                          .map(
                            (v) => ORDER_TYPE_LABEL[v.orderType] ?? v.orderType,
                          )
                          .join(tr("common.s1")),
                        tierCount: entrySummary(e).tierCount,
                      })}
                      ）
                    </Anchor>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  {tr("sales.quotes.everyLineWasEnteredByHand")}
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.priceEstimateSource")}
              </Text>
              {relatedEntries.some((e) =>
                e.variants.some((v) => v.estimateId),
              ) ? (
                <Stack gap={4}>
                  {relatedEntries
                    .flatMap((e) => e.variants)
                    .filter((v) => v.estimateId)
                    .map((v) => (
                      <Anchor
                        key={`${v.id}-${v.estimateId}`}
                        onClick={() =>
                          router.push(`/sales/trial-estimates/${v.estimateId}`)
                        }
                        size="sm"
                      >
                        <DocNumber c="blue">{v.estimateNumber}</DocNumber>
                      </Anchor>
                    ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  {tr("sales.quotes.thisPriceListWasRegisteredBy")}
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("sales.quotes.orderAcceptance")}
              </Text>
              <Text c="dimmed" size="sm">
                {tr("sales.quotes.createdOnceAccepted")}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="memo"
            ownerId={quote.quoteNumber}
            ownerType="quotes"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <IssueQuoteModal
        defaultValidUntil={quote.validUntil}
        onClose={() => setIssueOpen(false)}
        // 発行 → 成功後に PDF 生成（PDF ルートは未発行を 403 で拒否する）。
        onIssue={async (validUntil) => {
          const result = await issueQuote(quote.quoteNumber, validUntil);
          if (!result.ok) {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
          return result.ok;
        }}
        onIssued={(meta) => {
          setPdfFile(meta);
          setPdfNonce((n) => n + 1);
          router.refresh();
        }}
        opened={issueOpen}
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
      />
    </DetailShell>
  );
}
