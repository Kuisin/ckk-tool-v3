"use client";

/**
 * DeliveryNoteDetail — 納品書 詳細 (SH22, design.md §8.2).
 *
 * SummaryGrid（番号 / 出荷書番号 link / 納品先 / 届け先 / 方法 / 価格記載 /
 * 納品日 …）+ 明細テーブル（製品 / 数量 / 単価 / 金額 — 価格記載ありのみ）+
 * Tabs: 概要 / 履歴。
 *
 * Actions: 編集（DRAFT のみ）/ PDF（/api/pdf/delivery-note?id=DRN-…）/
 * 発行（DRAFT → ISSUED）/ 納品済み（ISSUED → DELIVERED + deliveredAt）。
 */

import {
  Anchor,
  Badge,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconTruckDelivery } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  issueDeliveryNote,
  markDelivered,
} from "@/app/(dashboard)/shipping/delivery-notes/actions";
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
import { DeliveryMethodBadge } from "./DeliveryNoteTable";
import { type DeliveryNote, isEditable } from "./model";

const BASE_PATH = "/shipping/delivery-notes";

export function DeliveryNoteDetail({
  note,
  auditEntries,
}: {
  note: DeliveryNote;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

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
            ...(note.status === "DRAFT"
              ? [
                  {
                    label: "発行",
                    icon: <IconCheck size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            ...(note.status === "ISSUED"
              ? [
                  {
                    label: "納品済みにする",
                    icon: <IconTruckDelivery size={14} />,
                    onClick: () => setDeliverOpen(true),
                  },
                ]
              : []),
          ]}
          onEdit={
            isEditable(note)
              ? () => router.push(`${BASE_PATH}/${note.id}/edit`)
              : undefined
          }
          pdf={{ href: `/api/pdf/delivery-note?id=${note.id}` }}
        />
      }
      breadcrumbs={["出荷", { label: "納品書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(note.createdAt)}
      status={<StatusBadge entity="DeliveryNote" status={note.status} />}
      title={note.deliveryNumber}
      updatedAt={formatDateTime(note.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="納品番号"
          value={<DocNumber>{note.deliveryNumber}</DocNumber>}
        />
        <FieldValue
          label="出荷書番号"
          value={
            <Anchor
              onClick={() =>
                router.push(
                  `/shipping/shipping-orders/${note.shippingOrderNumber}`,
                )
              }
              size="sm"
            >
              <DocNumber c="blue">{note.shippingOrderNumber}</DocNumber>
            </Anchor>
          }
        />
        <FieldValue
          label="注文請書番号"
          value={<DocNumber>{note.salesOrderNumber}</DocNumber>}
        />
        <FieldValue
          label="納品先"
          value={
            note.recipientBranchName
              ? `${note.recipientName} / ${note.recipientBranchName}`
              : note.recipientName
          }
        />
        <FieldValue
          label="届け先（最終需要家）"
          value={
            note.deliveryMethod === "DIRECT_TO_USER"
              ? (note.endUserName ?? "—")
              : "—"
          }
        />
        <FieldValue
          label="納品方法"
          value={<DeliveryMethodBadge method={note.deliveryMethod} />}
        />
        <FieldValue
          label="価格記載"
          value={
            <Badge color={note.includePrice ? "green" : "gray"} variant="light">
              {note.includePrice ? "あり" : "なし"}
            </Badge>
          }
        />
        <FieldValue label="納品日" value={formatDate(note.deliveredAt)} />
        <FieldValue
          label="合計金額"
          value={
            note.includePrice ? (
              <MoneyText ta="left" value={note.totalAmount} />
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          明細（{note.items.length}）
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>製品</Table.Th>
                <Table.Th ta="right">数量</Table.Th>
                {note.includePrice && (
                  <>
                    <Table.Th ta="right">単価</Table.Th>
                    <Table.Th ta="right">金額</Table.Th>
                  </>
                )}
                <Table.Th>備考</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {note.items.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{it.productName}</Table.Td>
                  <Table.Td className="tabular-nums" ta="right">
                    {it.quantity}
                  </Table.Td>
                  {note.includePrice && (
                    <>
                      <Table.Td ta="right">
                        <MoneyText value={it.unitPrice} />
                      </Table.Td>
                      <Table.Td ta="right">
                        <MoneyText value={it.amount} />
                      </Table.Td>
                    </>
                  )}
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {it.notes ?? "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            {note.includePrice && (
              <Table.Tfoot>
                <Table.Tr>
                  <Table.Td fw={700}>合計</Table.Td>
                  <Table.Td className="tabular-nums" fw={700} ta="right">
                    {note.totalQuantity}
                  </Table.Td>
                  <Table.Td />
                  <Table.Td fw={700} ta="right">
                    <MoneyText value={note.totalAmount} />
                  </Table.Td>
                  <Table.Td />
                </Table.Tr>
              </Table.Tfoot>
            )}
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
                備考
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {note.notes || "—"}
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
        message={`納品書 ${note.deliveryNumber} を発行します。発行後は編集できません。`}
        onClose={() => setIssueOpen(false)}
        onConfirm={() =>
          run(
            () => issueDeliveryNote(note.deliveryNumber),
            "発行しました",
            `納品書 ${note.deliveryNumber} を発行しました`,
          )
        }
        opened={issueOpen}
        title="発行の確認"
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel="納品済みにする"
        loading={isPending}
        message={`納品書 ${note.deliveryNumber} を納品済みにします。納品日は本日で記録されます。`}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() =>
          run(
            () => markDelivered(note.deliveryNumber),
            "納品済みにしました",
            `納品書 ${note.deliveryNumber} を納品済みにしました`,
          )
        }
        opened={deliverOpen}
        title="納品の確認"
      />
    </DetailShell>
  );
}
