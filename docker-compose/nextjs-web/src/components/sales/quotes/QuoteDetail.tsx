"use client";

/**
 * QuoteDetail — 見積書 詳細 (design.md §8.2).
 *
 * Summary grid + tabs: 明細 (価格表 tier-resolved lines + 値引き + 適用価格表) /
 * PDF (発行時に保存された PDF のメタ + インライン A4 プレビュー) / 関連 (試算・
 * 価格表 back-links) / 履歴. 発行 (DRAFT → ISSUED) generates the PDF via the
 * Gotenberg route and stores it in SeaweedFS; the PDF tab streams that stored
 * copy. Backed by sales.quotes via the server page; 発行 persists through the
 * issueQuote Server Action.
 */

import { Anchor, Badge, Stack, Table, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCopy, IconDownload, IconSend } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { issueQuote } from "@/app/(dashboard)/sales/quotes/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import {
  PdfAttachmentPanel,
  type PdfFileMeta,
} from "@/components/ui/PdfAttachmentPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDate, formatDateTime } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
import type { PriceListEntry } from "../price-lists/model";
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
  relatedEntries,
  auditEntries,
}: {
  quote: Quote;
  /** この見積の明細 tier が属する価格表エントリ（関連タブ・適用価格表）。 */
  relatedEntries: PriceListEntry[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const totals = quoteTotals(quote);

  const status = quote.status;
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(quote.pdfFile);
  const [issueOpen, setIssueOpen] = useState(false);
  // Bumped on 再生成 so the preview iframe reloads the regenerated PDF.
  const [pdfNonce, setPdfNonce] = useState(0);

  const pdfUrl = (extra = "") =>
    `/api/pdf/quote?id=${encodeURIComponent(quote.id)}${extra}`;

  const regenerate = async () => {
    try {
      const res = await fetch(pdfUrl("&force=1"));
      if (!res.ok) throw new Error(`PDF route ${res.status}`);
      const blob = await res.blob();
      setPdfFile((prev) => (prev ? { ...prev, sizeBytes: blob.size } : prev));
      setPdfNonce((n) => n + 1);
      notifications.show({
        title: "再生成しました",
        message: "PDF を再生成・保存しました",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "エラー",
        message: "PDF の再生成に失敗しました",
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
                    label: "発行",
                    icon: <IconSend size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            {
              label: "PDFをダウンロード",
              icon: <IconDownload size={14} />,
              onClick: () =>
                window.open(
                  pdfUrl("&download=1"),
                  "_blank",
                  "noopener,noreferrer",
                ),
            },
            {
              label: "複製",
              icon: <IconCopy size={14} />,
              divider: true,
              onClick: () => router.push(`${BASE_PATH}/new?from=${quote.id}`),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${quote.id}/edit`)}
          pdf={{ href: pdfUrl() }}
        />
      }
      breadcrumbs={["販売", { label: "見積書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(quote.createdAt)}
      status={<StatusBadge entity="Quote" status={status} />}
      title={quote.quoteNumber}
      updatedAt={formatDateTime(quote.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue label="顧客" value={quote.customerName} />
        <FieldValue label="支店" value={quote.customerBranchName} />
        <FieldValue label="作成者" value={quote.createdBy} />
        <FieldValue label="有効期限" value={formatDate(quote.validUntil)} />
        <FieldValue label="明細数" value={`${quote.items.length}件`} />
        <FieldValue
          label="合計金額（税込）"
          value={<MoneyText ta="left" value={totals.grandTotal} />}
        />
      </SummaryGrid>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={860}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>製品</Table.Th>
                  <Table.Th>注文種別</Table.Th>
                  <Table.Th ta="right">数量</Table.Th>
                  <Table.Th ta="right">単価</Table.Th>
                  <Table.Th ta="right">値引き</Table.Th>
                  <Table.Th ta="right">金額</Table.Th>
                  <Table.Th>納期</Table.Th>
                  <Table.Th>適用価格表</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {quote.items.map((it) => {
                  const tierRef = findPriceTierRefIn(
                    relatedEntries,
                    it.priceTierId,
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
                      <Table.Td>{formatDate(it.deliveryDate)}</Table.Td>
                      <Table.Td>
                        {tierRef ? (
                          <Text className="tabular-nums" ff="mono" size="xs">
                            {tierRef.label}
                          </Text>
                        ) : (
                          <Text c="orange" size="xs">
                            価格表なし
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
                      小計
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
                      消費税（10%）
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
                      合計（税込）
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
            emptyAction={
              status === "DRAFT" ? (
                <PrimaryButton
                  leftSection={<IconSend size={14} />}
                  onClick={() => setIssueOpen(true)}
                >
                  発行
                </PrimaryButton>
              ) : undefined
            }
            emptyMessage="PDF は未生成です。発行すると PDF が生成・保存されます。"
            file={pdfFile}
            onDownload={() =>
              window.open(
                pdfUrl("&download=1"),
                "_blank",
                "noopener,noreferrer",
              )
            }
            onRegenerate={regenerate}
            previewSrc={pdfUrl(`&v=${pdfNonce}`)}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                適用価格表
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
                      {ORDER_TYPE_LABEL[e.orderType]}・{e.tiers.length}段階）
                    </Anchor>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  —（全明細が手動入力です）
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                試算元
              </Text>
              {relatedEntries.some((e) => e.estimateId) ? (
                <Stack gap={4}>
                  {relatedEntries
                    .filter((e) => e.estimateId)
                    .map((e) => (
                      <Anchor
                        key={e.estimateId}
                        onClick={() =>
                          router.push(`/sales/trial-estimates/${e.estimateId}`)
                        }
                        size="sm"
                      >
                        <DocNumber c="blue">{e.estimateNumber}</DocNumber>
                      </Anchor>
                    ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  —（手動登録の価格表です）
                </Text>
              )}
            </div>

            <div>
              <Text c="dimmed" mb={4} size="xs">
                注文受諾書
              </Text>
              <Text c="dimmed" size="sm">
                —（受諾後に作成されます）
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <IssueQuoteModal
        defaultValidUntil={quote.validUntil}
        onClose={() => setIssueOpen(false)}
        onIssued={async (meta, validUntil) => {
          const result = await issueQuote(quote.quoteNumber, validUntil);
          if (result.ok) {
            setPdfFile(meta);
            setPdfNonce((n) => n + 1);
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        }}
        opened={issueOpen}
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
      />
    </DetailShell>
  );
}
