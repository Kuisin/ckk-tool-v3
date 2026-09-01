"use client";

/**
 * ClosingDetail — 締日処理 詳細 (BL22, design.md §8.2).
 *
 * SummaryGrid（顧客 / 締日 / 合計金額 / 状態 / 生成請求書リンク / 処理日）+
 * 手続き状況（ProcedurePanel — 未処理→請求書生成→エクスポート済、対象出荷 ← /
 * 請求書 →）+ 期間内の対象出荷テーブル（出荷書番号 / 出荷日 / 数量 / 金額）+
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
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import {
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import { formatMoney } from "@/lib/format";
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
  const tr = useTr();
  const fmt = useFormat();
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
          title: tr("請求書を生成しました"),
          message: tr("請求書 {invoiceNumber} を作成しました", {
            invoiceNumber: result.data.invoiceNumber,
          }),
          color: "green",
        });
        router.push(`${INVOICES_PATH}/${result.data.invoiceNumber}`);
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
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

  // ── 手続き状況（未処理 → 請求書生成 → エクスポート済）─────────────────
  const stages: ProcedureStage[] = [
    {
      key: "pending",
      label: tr("未処理"),
      description: tr("対象出荷 {v0} 件", { v0: closing.shipments.length }),
      loading: closing.status === "PENDING",
    },
    {
      key: "processed",
      label: tr("請求書生成"),
      description: closing.processedAt
        ? fmt.date(closing.processedAt)
        : tr("請求書を作成"),
      loading: closing.status === "PROCESSED",
    },
    {
      key: "exported",
      label: tr("エクスポート済"),
      description: tr("弥生会計 CSV"),
    },
  ];
  const active =
    closing.status === "PENDING" ? 0 : closing.status === "PROCESSED" ? 1 : 3;

  // 上流 = 請求対象として集計した出荷書。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "shipments",
      title: tr("対象出荷"),
      summary:
        closing.shipments.length > 0
          ? tr("{v0} 件・{totalQuantity} 本", {
              v0: closing.shipments.length,
              totalQuantity: totalQuantity,
            })
          : null,
      items: closing.shipments.map((sp) => ({
        key: sp.deliveryOrderNumber,
        label: sp.deliveryOrderNumber,
        href: `/shipping/delivery-orders/${sp.deliveryOrderNumber}`,
        note: tr("{quantity} 本・{v1}", {
          quantity: sp.quantity,
          v1: formatMoney(sp.amount),
        }),
      })),
      emptyNote: tr("請求対象の出荷がありません"),
    },
  ];

  // 下流 = 締めで生成した請求書（1 締め = 1 請求書）。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "invoice",
      title: tr("請求書"),
      items: closing.invoiceNumber
        ? [
            {
              key: closing.invoiceNumber,
              label: closing.invoiceNumber,
              href: `${INVOICES_PATH}/${closing.invoiceNumber}`,
              done: closing.status === "EXPORTED",
              note: formatMoney(closing.totalAmount),
            },
          ]
        : [],
      emptyNote: tr("未生成（「請求書を生成」で作成します）"),
    },
  ];

  return (
    <DetailShell
      actions={
        isProcessable(closing) ? (
          <PrimaryButton
            leftSection={<IconFileInvoice size={14} />}
            onClick={() => setProcessOpen(true)}
            style={{ flexShrink: 0 }}
          >
            {tr("請求書を生成")}
          </PrimaryButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("請求"),
        { label: tr("締日処理"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(closing.createdAt)}
      status={<StatusBadge entity="BillingClosing" status={closing.status} />}
      title={tr("{customerName}（{v1} 締め）", {
        customerName: closing.customerName,
        v1: fmt.date(closing.closingDate),
      })}
    >
      <SummaryGrid>
        <FieldValue label={tr("顧客")} value={closing.customerName} />
        <FieldValue label={tr("締日")} value={fmt.date(closing.closingDate)} />
        <FieldValue
          label={tr("合計金額（税抜）")}
          value={<MoneyText ta="left" value={closing.totalAmount} />}
        />
        <FieldValue
          label={tr("状態")}
          value={
            <StatusBadge entity="BillingClosing" status={closing.status} />
          }
        />
        <FieldValue
          label={tr("生成請求書")}
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
          label={tr("処理日")}
          value={fmt.dateTime(closing.processedAt)}
        />
      </SummaryGrid>

      <ProcedurePanel
        active={active}
        handoffGroups={handoffGroups}
        sourceGroups={sourceGroups}
        stages={stages}
      />

      <Paper p="md" radius="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={5}>対象出荷（{closing.shipments.length}）</Title>
        </Group>
        {closing.shipments.length === 0 ? (
          <Group gap="xs" py="md">
            <IconTruck size={18} />
            <Text c="dimmed" size="sm">
              {tr("請求対象の出荷がありません")}
            </Text>
          </Group>
        ) : (
          <Table.ScrollContainer minWidth={560}>
            <Table highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("出荷書番号")}</Table.Th>
                  <Table.Th>{tr("出荷日")}</Table.Th>
                  <Table.Th ta="right">{tr("数量")}</Table.Th>
                  <Table.Th ta="right">{tr("金額")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {closing.shipments.map((s) => (
                  <Table.Tr key={s.deliveryOrderNumber}>
                    <Table.Td>
                      <Anchor
                        onClick={() =>
                          router.push(
                            `/shipping/delivery-orders/${s.deliveryOrderNumber}`,
                          )
                        }
                        size="sm"
                      >
                        <DocNumber c="blue">{s.deliveryOrderNumber}</DocNumber>
                      </Anchor>
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {fmt.date(s.shippedAt)}
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
                  <Table.Td fw={700}>{tr("合計")}</Table.Td>
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

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("概要")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("備考")}
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
      </AppTabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("請求書を生成")}
        loading={isPending}
        message={tr(
          "{customerName} の {v1} 締め分から請求書（下書き）を生成します。対象出荷 {v2} 件が明細になります。",
          {
            customerName: closing.customerName,
            v1: fmt.date(closing.closingDate),
            v2: closing.shipments.length,
          },
        )}
        onClose={() => setProcessOpen(false)}
        onConfirm={process}
        opened={processOpen}
        title={tr("請求書生成の確認")}
      />
    </DetailShell>
  );
}
