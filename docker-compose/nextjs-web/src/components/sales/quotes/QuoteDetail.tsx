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
import { MemoPanel } from "@/components/ui/MemoPanel";
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
import type { MemoView } from "@/lib/document-memos";
import { downloadFile } from "@/lib/download";
import { formatDate, formatDateTime } from "@/lib/format";
import { ORDER_TYPE_LABEL } from "@/lib/mock";
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
}: {
  quote: Quote;
  /** 保管済み PDF のメタ（SeaweedFS 由来。未生成なら null）。 */
  pdfMeta: PdfFileMeta | null;
  /** この見積の明細 tier が属する価格表エントリ（関連タブ・適用価格表）。 */
  relatedEntries: PriceListEntry[];
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
}) {
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
            // PDF は発行後のみ（未発行はルートも 403）。
            ...(canViewPdf
              ? [
                  {
                    label: "PDFをダウンロード",
                    icon: <IconDownload size={14} />,
                    onClick: () =>
                      void downloadFile(pdfUrl("&download=1"), pdfFilename),
                  },
                ]
              : []),
            {
              label: "複製",
              icon: <IconCopy size={14} />,
              divider: true,
              onClick: () => router.push(`${BASE_PATH}/new?from=${quote.id}`),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${quote.id}/edit`)}
          pdf={canViewPdf ? { href: pdfUrl() } : undefined}
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
        <FieldValue label="営業担当" value={quote.salesRepName} />
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
          <Tabs.Tab value="memo">メモ</Tabs.Tab>
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
            downloadHref={pdfUrl("&download=1")}
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
            emptyMessage="発行後に PDF を閲覧できます。"
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
                      {e.variants
                        .map(
                          (v) => ORDER_TYPE_LABEL[v.orderType] ?? v.orderType,
                        )
                        .join("・")}
                      ・{entrySummary(e).tierCount}段階）
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
      </Tabs>

      <IssueQuoteModal
        defaultValidUntil={quote.validUntil}
        onClose={() => setIssueOpen(false)}
        // 発行 → 成功後に PDF 生成（PDF ルートは未発行を 403 で拒否する）。
        onIssue={async (validUntil) => {
          const result = await issueQuote(quote.quoteNumber, validUntil);
          if (!result.ok) {
            notifications.show({
              title: "エラー",
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
