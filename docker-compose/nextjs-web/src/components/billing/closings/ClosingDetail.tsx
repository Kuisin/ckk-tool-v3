"use client";

/**
 * ClosingDetail — 締日処理 詳細 (BL22, design.md §8.2).
 *
 * SummaryGrid（顧客 / 締日 / 合計金額 / 状態 / 生成請求書リンク / 処理日）+
 * 期間内の対象出荷テーブル（出荷書番号 / 出荷日 / 数量 / 金額）+
 * Tabs: 概要 / 履歴。
 *
 * Actions: 「請求書を生成」（PENDING のみ）→ processClosing(id) が請求書
 * （DRAFT）を作成し PROCESSED 化 → 生成した請求書詳細へ遷移する。
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
import { IconFileInvoice, IconTruck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { processClosing } from "@/app/(dashboard)/billing/closings/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDate, formatDateTime } from "@/lib/format";
import { type BillingClosingDetail, isProcessable } from "./model";

const BASE_PATH = "/billing/closings";
const INVOICES_PATH = "/billing/invoices";

export function ClosingDetail({
  closing,
  auditEntries,
}: {
  closing: BillingClosingDetail;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [processOpen, setProcessOpen] = useState(false);

  const process = () => {
    startTransition(async () => {
      const result = await processClosing(closing.id);
      if (result.ok) {
        notifications.show({
          title: "請求書を生成しました",
          message: `請求書 ${result.data.invoiceNumber} を作成しました`,
          color: "green",
        });
        router.push(`${INVOICES_PATH}/${result.data.invoiceNumber}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const totalQuantity = closing.shipments.reduce(
    (sum, s) => sum + s.quantity,
    0,
  );
  const totalAmount = closing.shipments.reduce((sum, s) => sum + s.amount, 0);

  return (
    <DetailShell
      actions={
        isProcessable(closing) ? (
          <PrimaryButton
            leftSection={<IconFileInvoice size={14} />}
            onClick={() => setProcessOpen(true)}
            style={{ flexShrink: 0 }}
          >
            請求書を生成
          </PrimaryButton>
        ) : undefined
      }
      breadcrumbs={["請求", { label: "締日処理", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(closing.createdAt)}
      status={<StatusBadge entity="BillingClosing" status={closing.status} />}
      title={`${closing.customerName}（${formatDate(closing.closingDate)} 締め）`}
    >
      <SummaryGrid>
        <FieldValue label="顧客" value={closing.customerName} />
        <FieldValue label="締日" value={formatDate(closing.closingDate)} />
        <FieldValue
          label="合計金額（税抜）"
          value={<MoneyText ta="left" value={closing.totalAmount} />}
        />
        <FieldValue
          label="状態"
          value={
            <StatusBadge entity="BillingClosing" status={closing.status} />
          }
        />
        <FieldValue
          label="生成請求書"
          value={
            closing.invoiceNumber ? (
              <Anchor
                onClick={() =>
                  router.push(`${INVOICES_PATH}/${closing.invoiceNumber}`)
                }
                size="sm"
              >
                <DocNumber c="blue">{closing.invoiceNumber}</DocNumber>
              </Anchor>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label="処理日"
          value={formatDateTime(closing.processedAt)}
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={5}>対象出荷（{closing.shipments.length}）</Title>
        </Group>
        {closing.shipments.length === 0 ? (
          <Group gap="xs" py="md">
            <IconTruck size={18} />
            <Text c="dimmed" size="sm">
              請求対象の出荷がありません
            </Text>
          </Group>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>出荷書番号</Table.Th>
                  <Table.Th>出荷日</Table.Th>
                  <Table.Th ta="right">数量</Table.Th>
                  <Table.Th ta="right">金額</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {closing.shipments.map((s) => (
                  <Table.Tr key={s.shippingOrderNumber}>
                    <Table.Td>
                      <Anchor
                        onClick={() =>
                          router.push(
                            `/shipping/shipping-orders/${s.shippingOrderNumber}`,
                          )
                        }
                        size="sm"
                      >
                        <DocNumber c="blue">{s.shippingOrderNumber}</DocNumber>
                      </Anchor>
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {formatDate(s.shippedAt)}
                    </Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {s.quantity}
                    </Table.Td>
                    <Table.Td ta="right">
                      <MoneyText value={s.amount} />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td fw={700}>合計</Table.Td>
                  <Table.Td />
                  <Table.Td className="tabular-nums" fw={700} ta="right">
                    {totalQuantity}
                  </Table.Td>
                  <Table.Td fw={700} ta="right">
                    <MoneyText value={totalAmount} />
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                備考
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {closing.notes || "—"}
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
        confirmLabel="請求書を生成"
        loading={isPending}
        message={`${closing.customerName} の ${formatDate(closing.closingDate)} 締め分から請求書（下書き）を生成します。対象出荷 ${closing.shipments.length} 件が明細になります。`}
        onClose={() => setProcessOpen(false)}
        onConfirm={process}
        opened={processOpen}
        title="請求書生成の確認"
      />
    </DetailShell>
  );
}
