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
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { canIssue, canMarkPaid, canMarkSent, type Invoice } from "./model";

const BASE_PATH = "/billing/invoices";

export function InvoiceDetail({
  invoice,
  auditEntries,
}: {
  invoice: Invoice;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [sentOpen, setSentOpen] = useState(false);
  const [paidOpen, setPaidOpen] = useState(false);

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
            {
              label: "弥生会計CSV",
              icon: <IconFileSpreadsheet size={14} />,
              divider: true,
              onClick: () =>
                window.open(
                  `/api/export/yayoi?invoice=${invoice.invoiceNumber}`,
                  "_blank",
                  "noopener,noreferrer",
                ),
            },
          ]}
          pdf={{ href: `/api/pdf/invoice?id=${invoice.id}` }}
        />
      }
      breadcrumbs={["請求", { label: "請求書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(invoice.createdAt)}
      status={<StatusBadge entity="Invoice" status={invoice.status} />}
      title={invoice.invoiceNumber}
      updatedAt={formatDateTime(invoice.updatedAt)}
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
        <FieldValue
          label="請求期間"
          value={`${formatDate(invoice.billingPeriodFrom)} 〜 ${formatDate(invoice.billingPeriodTo)}`}
        />
        <FieldValue
          label="小計"
          value={<MoneyText ta="left" value={invoice.subtotal} />}
        />
        <FieldValue
          label="消費税（10%）"
          value={<MoneyText ta="left" value={invoice.taxAmount} />}
        />
        <FieldValue
          label="合計金額（税込）"
          value={<MoneyText ta="left" value={invoice.totalAmount} />}
        />
        <FieldValue label="支払期限" value={formatDate(invoice.dueDate)} />
        <FieldValue label="発行日" value={formatDate(invoice.issuedAt)} />
        <FieldValue
          label="弥生エクスポート"
          value={
            invoice.yayoiExportedAt
              ? formatDateTime(invoice.yayoiExportedAt)
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
                <Table.Td fw={700}>消費税（10%）</Table.Td>
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

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                送付日時
              </Text>
              <Text size="sm">{formatDateTime(invoice.sentAt)}</Text>
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
