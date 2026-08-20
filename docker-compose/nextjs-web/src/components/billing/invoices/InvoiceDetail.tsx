"use client";

/**
 * InvoiceDetail — 請求書 詳細 (BL21, design.md §8.2).
 *
 * SummaryGrid（番号 / 顧客+支店 / 請求期間 / 小計 / 消費税 / 合計 / 支払期限 /
 * 発行日 / 弥生エクスポート）+ 明細テーブル（摘要 / 数量 / 単価 / 金額 / 由来
 * SHP・DRN リンク）+ Tabs: 概要 / 履歴。
 *
 * Actions: PDF（/api/pdf/invoice?id=INV-…）/ 発行（DRAFT → ISSUED）/
 * 送付済み（ISSUED → SENT）/ 入金済み（SENT → PAID）/
 * 弥生CSV（/api/export/yayoi?invoice=INV-… ダウンロード）。
 */

import {
  Anchor,
  Group,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCash,
  IconCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconSend,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  issueInvoice,
  markPaid,
  markSent,
} from "@/app/(dashboard)/billing/invoices/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
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
import type { ActionResult } from "@/lib/server-action";
import {
  canIssue,
  canMarkPaid,
  canMarkSent,
  type Invoice,
  taxLabel,
} from "./model";

const BASE_PATH = "/billing/invoices";

export function InvoiceDetail({
  invoice,
  pdfMeta,
  auditEntries,
  memos,
}: {
  invoice: Invoice;
  /** 保管済み PDF のメタ（SeaweedFS 由来。未生成なら null）。 */
  pdfMeta: PdfFileMeta | null;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
}) {
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

  // PDF は発行後のみ閲覧できる（ルート側も 403 で拒否する）。
  const canViewPdf = invoice.status !== "DRAFT";
  const pdfFilename = `${invoice.invoiceNumber}.pdf`;
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(pdfMeta);
  // 再生成でプレビューの iframe を貼り替えるためのキャッシュバスター。
  const [pdfNonce, setPdfNonce] = useState(0);

  const pdfUrl = (extra = "") =>
    `/api/pdf/invoice?id=${encodeURIComponent(invoice.id)}${extra}`;

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

  const run = (
    action: () => Promise<ActionResult>,
    successTitle: string,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: successTitle,
          message: successMessage,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...(canIssue(invoice)
              ? [
                  {
                    label: "発行",
                    icon: <IconCheck size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            ...(canMarkSent(invoice)
              ? [
                  {
                    label: "送付済みにする",
                    icon: <IconSend size={14} />,
                    onClick: () => setSentOpen(true),
                  },
                ]
              : []),
            ...(canMarkPaid(invoice)
              ? [
                  {
                    label: "入金済みにする",
                    icon: <IconCash size={14} />,
                    onClick: () => setPaidOpen(true),
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
              label: "弥生会計CSV",
              icon: <IconFileSpreadsheet size={14} />,
              divider: true,
              // 実アンカーで別タブへ（PWA でもアプリ内ブラウザで開く）。
              href: `/api/export/yayoi?invoice=${invoice.invoiceNumber}`,
            },
          ]}
          pdf={canViewPdf ? { href: pdfUrl() } : undefined}
        />
      }
      breadcrumbs={["請求", { label: "請求書", href: BASE_PATH }, "詳細"]}
      createdAt={fmt.dateTime(invoice.createdAt)}
      status={<StatusBadge entity="Invoice" status={invoice.status} />}
      title={invoice.invoiceNumber}
      updatedAt={fmt.dateTime(invoice.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="請求番号"
          value={<DocNumber>{invoice.invoiceNumber}</DocNumber>}
        />
        <FieldValue
          label="顧客"
          value={
            invoice.customerBranchName
              ? `${invoice.customerName} / ${invoice.customerBranchName}`
              : invoice.customerName
          }
        />
        <FieldValue label="営業担当" value={invoice.salesRepName} />
        <FieldValue label="作成者" value={invoice.createdByName} />
        <FieldValue
          label="請求期間"
          value={`${fmt.date(invoice.billingPeriodFrom)} 〜 ${fmt.date(invoice.billingPeriodTo)}`}
        />
        <FieldValue
          label="小計"
          value={<MoneyText ta="left" value={invoice.subtotal} />}
        />
        <FieldValue
          label={taxLabel(invoice.taxType)}
          value={<MoneyText ta="left" value={invoice.taxAmount} />}
        />
        <FieldValue
          label="合計金額（税込）"
          value={<MoneyText ta="left" value={invoice.totalAmount} />}
        />
        <FieldValue label="支払期限" value={fmt.date(invoice.dueDate)} />
        <FieldValue label="発行日" value={fmt.date(invoice.issuedAt)} />
        <FieldValue
          label="弥生エクスポート"
          value={
            invoice.yayoiExportedAt
              ? fmt.dateTime(invoice.yayoiExportedAt)
              : "未エクスポート"
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          明細（{invoice.items.length}）
        </Title>
        <Table.ScrollContainer minWidth={640}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>摘要</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                <Table.Th ta="right">単価</Table.Th>
                <Table.Th ta="right">金額</Table.Th>
                <Table.Th>由来</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {invoice.items.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.description}</Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.quantity}
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={it.unitPrice} />
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={it.amount} />
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="wrap">
                      {it.shippingOrderNumber && (
                        <Anchor
                          onClick={() =>
                            router.push(
                              `/shipping/shipping-orders/${it.shippingOrderNumber}`,
                            )
                          }
                          size="sm"
                        >
                          <DocNumber c="blue">
                            {it.shippingOrderNumber}
                          </DocNumber>
                        </Anchor>
                      )}
                      {it.deliveryNoteNumber && (
                        <Anchor
                          onClick={() =>
                            router.push(
                              `/shipping/delivery-notes/${it.deliveryNoteNumber}`,
                            )
                          }
                          size="sm"
                        >
                          <DocNumber c="blue">
                            {it.deliveryNoteNumber}
                          </DocNumber>
                        </Anchor>
                      )}
                      {!it.shippingOrderNumber && !it.deliveryNoteNumber && (
                        <Text c="dimmed" size="sm">
                          —
                        </Text>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Td fw={700}>小計</Table.Td>
                <Table.Td className="tabular-nums" fw={700} ta="right">
                  {invoice.totalQuantity}
                </Table.Td>
                <Table.Td />
                <Table.Td fw={700} ta="right">
                  <MoneyText value={invoice.subtotal} />
                </Table.Td>
                <Table.Td />
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={700}>{taxLabel(invoice.taxType)}</Table.Td>
                <Table.Td />
                <Table.Td />
                <Table.Td fw={700} ta="right">
                  <MoneyText value={invoice.taxAmount} />
                </Table.Td>
                <Table.Td />
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={700}>合計金額（税込）</Table.Td>
                <Table.Td />
                <Table.Td />
                <Table.Td fw={700} ta="right">
                  <MoneyText value={invoice.totalAmount} />
                </Table.Td>
                <Table.Td />
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="memo">メモ</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                送付日時
              </Text>
              <Text size="sm">{fmt.dateTime(invoice.sentAt)}</Text>
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                備考
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {invoice.notes || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: 未表示タブの iframe は読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="pdf">
          <PdfAttachmentPanel
            downloadHref={pdfUrl("&download=1")}
            emptyAction={
              canIssue(invoice) ? (
                <PrimaryButton
                  leftSection={<IconCheck size={14} />}
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

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="memo"
            ownerId={invoice.invoiceNumber}
            ownerType="invoices"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel="発行"
        loading={isPending}
        message={`請求書 ${invoice.invoiceNumber} を発行します。発行日は本日で記録されます。`}
        onClose={() => setIssueOpen(false)}
        onConfirm={() =>
          run(
            () => issueInvoice(invoice.invoiceNumber),
            "発行しました",
            `請求書 ${invoice.invoiceNumber} を発行しました`,
          )
        }
        opened={issueOpen}
        title="発行の確認"
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="送付済みにする"
        loading={isPending}
        message={`請求書 ${invoice.invoiceNumber} を送付済みにします。`}
        onClose={() => setSentOpen(false)}
        onConfirm={() =>
          run(
            () => markSent(invoice.invoiceNumber),
            "送付済みにしました",
            `請求書 ${invoice.invoiceNumber} を送付済みにしました`,
          )
        }
        opened={sentOpen}
        title="送付の確認"
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="入金済みにする"
        loading={isPending}
        message={`請求書 ${invoice.invoiceNumber} を入金済みにします。`}
        onClose={() => setPaidOpen(false)}
        onConfirm={() =>
          run(
            () => markPaid(invoice.invoiceNumber),
            "入金済みにしました",
            `請求書 ${invoice.invoiceNumber} を入金済みにしました`,
          )
        }
        opened={paidOpen}
        title="入金の確認"
      />
    </DetailShell>
  );
}
