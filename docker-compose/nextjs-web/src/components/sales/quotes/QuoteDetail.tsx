"use client";

/**
 * QuoteDetail — 見積書 詳細 (design.md §8.2).
 *
 * Summary grid + 明細 tab whose rows are 価格表 tier-resolved lines (one product
 * across several 数量 bands), plus 履歴. The PDF action points at the Gotenberg
 * route handler. `id` falls back to the first quote so the layout always renders.
 * Replace the mock lookup with a server fetch.
 */

import { Badge, Table, Tabs, Text } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { FieldValue } from "@/components/ui/FieldValue";
import { MoneyText } from "@/components/ui/MoneyText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { formatDate, formatDateTime } from "@/lib/format";
import { getQuote, MOCK_QUOTES, orderTypeLabel, quoteTotals } from "./mock";

const BASE_PATH = "/sales/quotes";

// TODO(server): fetch audit_logs for this quote.
const MOCK_AUDIT: AuditEntry[] = [
  {
    id: 1,
    action: "UPDATE",
    user: "鈴木",
    at: "2026/02/16 10:05",
    detail: "ステータス: 下書き → 発行済",
  },
  {
    id: 2,
    action: "CREATE",
    user: "鈴木",
    at: "2026/02/16 09:30",
    detail: "見積書を作成（価格表より自動解決）",
  },
];

export function QuoteDetail({ id }: { id: string }) {
  const router = useRouter();
  const quote = getQuote(id) ?? MOCK_QUOTES[0];
  const totals = quoteTotals(quote);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            {
              label: "複製",
              icon: <IconCopy size={14} />,
              onClick: () => router.push(`${BASE_PATH}/new?from=${quote.id}`),
            },
          ]}
          onEdit={() => router.push(`${BASE_PATH}/${quote.id}/edit`)}
          pdf={{ href: `/api/pdf/quote?id=${encodeURIComponent(quote.id)}` }}
        />
      }
      breadcrumbs={["販売", { label: "見積書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(quote.createdAt)}
      status={<StatusBadge entity="Quote" status={quote.status} />}
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

      <Tabs defaultValue="items">
        <Tabs.List>
          <Tabs.Tab value="items">明細</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={680}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>製品</Table.Th>
                  <Table.Th>注文種別</Table.Th>
                  <Table.Th ta="right">数量</Table.Th>
                  <Table.Th ta="right">単価</Table.Th>
                  <Table.Th ta="right">金額</Table.Th>
                  <Table.Th>納期</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {quote.items.map((it) => (
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
                      {it.priceTierId ? null : (
                        <Text c="orange" size="xs">
                          手動
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={it.amount} />
                    </Table.Td>
                    <Table.Td>{formatDate(it.deliveryDate)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td colSpan={4} ta="right">
                    <Text c="dimmed" size="sm">
                      小計
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.subtotal} />
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
                <Table.Tr>
                  <Table.Td colSpan={4} ta="right">
                    <Text c="dimmed" size="sm">
                      消費税（10%）
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.tax} />
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
                <Table.Tr>
                  <Table.Td colSpan={4} ta="right">
                    <Text fw={700} size="sm">
                      合計（税込）
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    <MoneyText value={totals.grandTotal} />
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>
    </DetailShell>
  );
}
