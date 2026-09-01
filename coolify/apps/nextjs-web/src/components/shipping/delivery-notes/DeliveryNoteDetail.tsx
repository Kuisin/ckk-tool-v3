"use client";

/**
 * DeliveryNoteDetail — 納品書 詳細 (SH22, design.md §8.2).
 *
 * SummaryGrid（番号 / 出荷書番号 link / 納品先 / 届け先 / 方法 / 価格記載 /
 * 納品日 …）+ 手続き状況（ProcedurePanel — 下書き→発行→納品済、出荷書・
 * 注文明細 ← / 請求書 →）+ 明細テーブル（製品 / 数量 / 単価 / 金額 —
 * 価格記載ありのみ）+ Tabs: 概要 / 履歴。
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
import {
  IconCheck,
  IconDownload,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  issueDeliveryNote,
  markDelivered,
} from "@/app/(dashboard)/shipping/delivery-notes/actions";
import type { InvoiceLink } from "@/components/billing/invoices/model";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ConfirmModal } from "@/components/ui/modals";
import {
  PdfAttachmentPanel,
  type PdfFileMeta,
} from "@/components/ui/PdfAttachmentPanel";
import {
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge, statusLabel } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useTabParam } from "@/hooks/useUrlState";
import { downloadFile } from "@/lib/download";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { DeliveryMethodBadge } from "./DeliveryNoteTable";
import { type DeliveryNote, isEditable } from "./model";

const BASE_PATH = "/shipping/delivery-notes";

export function DeliveryNoteDetail({
  note,
  pdfMeta,
  auditEntries,
  invoices = [],
}: {
  note: DeliveryNote;
  /** 保管済み PDF のメタ（SeaweedFS 由来。未生成なら null）。 */
  pdfMeta: PdfFileMeta | null;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** この納品書を請求した請求書（手続き状況の「次の書類へ」）。 */
  invoices?: InvoiceLink[];
}) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [issueOpen, setIssueOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  // PDF は発行後のみ閲覧できる（ルート側も 403 で拒否する）。
  const canViewPdf = note.status !== "DRAFT";
  const pdfFilename = `${note.deliveryNumber}.pdf`;
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(pdfMeta);
  // 再生成でプレビューの iframe を貼り替えるためのキャッシュバスター。
  const [pdfNonce, setPdfNonce] = useState(0);

  const pdfUrl = (extra = "") =>
    `/api/pdf/delivery-note?id=${encodeURIComponent(note.id)}${extra}`;

  // ── 手続き状況（下書き → 発行 → 納品済）─────────────────────────────────
  const stages: ProcedureStage[] = [
    {
      key: "draft",
      label: tr("下書き"),
      description: fmt.date(note.createdAt),
      loading: note.status === "DRAFT",
    },
    {
      key: "issued",
      label: tr("発行"),
      description: note.status === "DRAFT" ? "PDF を発行" : tr("発行済"),
      loading: note.status === "ISSUED",
    },
    {
      key: "delivered",
      label: tr("納品済"),
      description: note.deliveredAt
        ? fmt.date(note.deliveredAt)
        : tr("納品の確認"),
    },
  ];
  const active = note.status === "DRAFT" ? 0 : note.status === "ISSUED" ? 1 : 3;

  // 上流 = 出荷書（1 件）と、そこに束ねられた注文明細。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "delivery-order",
      title: tr("出荷書"),
      items: [
        {
          key: note.deliveryOrderNumber,
          label: note.deliveryOrderNumber,
          href: `/shipping/delivery-orders/${note.deliveryOrderNumber}`,
          note: tr("この納品書の出荷元"),
        },
      ],
      emptyNote: "—",
    },
    {
      key: "order-lines",
      title: tr("注文明細"),
      summary:
        note.orderLineNumbers.length > 0
          ? `${note.orderLineNumbers.length} 件`
          : null,
      items: note.orderLineNumbers.map((n) => ({
        key: n,
        label: n,
        href: `/sales/order-lines/${n}`,
      })),
      emptyNote: tr("—（在庫保管など、注文明細に紐づかない出荷）"),
    },
  ];

  // 下流 = この納品書を請求した請求書。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "invoices",
      title: tr("請求書"),
      items: invoices.map((inv) => ({
        key: inv.number,
        label: inv.number,
        href: `/billing/invoices/${inv.number}`,
        done: inv.status === "PAID",
        note: `${statusLabel("Invoice", inv.status)}・${formatMoney(inv.totalAmount)}`,
      })),
      emptyNote:
        note.status === "DELIVERED"
          ? tr("未請求（締日処理で請求書を作成します）")
          : tr("未請求（納品後に締日処理で請求します）"),
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
        title: tr("再生成しました"),
        message: tr("PDF を再生成・保存しました"),
        color: "green",
      });
    } catch {
      notifications.show({
        title: tr("エラー"),
        message: tr("PDF の再生成に失敗しました"),
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
          title: tr("エラー"),
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
                    label: tr("発行"),
                    icon: <IconCheck size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            ...(note.status === "ISSUED"
              ? [
                  {
                    label: tr("納品済みにする"),
                    icon: <IconTruckDelivery size={14} />,
                    onClick: () => setDeliverOpen(true),
                  },
                ]
              : []),
            // PDF は発行後のみ（未発行はルートも 403）。
            ...(canViewPdf
              ? [
                  {
                    label: tr("PDFをダウンロード"),
                    icon: <IconDownload size={14} />,
                    onClick: () =>
                      void downloadFile(pdfUrl("&download=1"), pdfFilename),
                  },
                ]
              : []),
          ]}
          onEdit={
            isEditable(note)
              ? () => router.push(`${BASE_PATH}/${note.id}/edit`)
              : undefined
          }
          pdf={canViewPdf ? { href: pdfUrl() } : undefined}
        />
      }
      breadcrumbs={[
        tr("出荷"),
        { label: tr("納品書"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(note.createdAt)}
      status={<StatusBadge entity="DeliveryNote" status={note.status} />}
      title={note.deliveryNumber}
      updatedAt={fmt.dateTime(note.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("納品番号")}
          value={<DocNumber>{note.deliveryNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("出荷書番号")}
          value={
            <Anchor
              onClick={() =>
                router.push(
                  `/shipping/delivery-orders/${note.deliveryOrderNumber}`,
                )
              }
              size="sm"
            >
              <DocNumber c="blue">{note.deliveryOrderNumber}</DocNumber>
            </Anchor>
          }
        />
        <FieldValue
          label={tr("注文明細番号")}
          value={
            note.orderLineNumbers.length > 0 ? (
              <Stack gap={2}>
                {note.orderLineNumbers.map((n) => (
                  <DocNumber key={n}>{n}</DocNumber>
                ))}
              </Stack>
            ) : null
          }
        />
        <FieldValue
          label={tr("納品先")}
          value={
            note.recipientBranchName
              ? `${note.recipientName} / ${note.recipientBranchName}`
              : note.recipientName
          }
        />
        <FieldValue
          label={tr("届け先（最終需要家）")}
          value={
            note.deliveryMethod === "DIRECT_TO_USER"
              ? (note.endUserName ?? "—")
              : "—"
          }
        />
        <FieldValue label={tr("営業担当")} value={note.salesRepName} />
        <FieldValue label={tr("作成者")} value={note.createdByName} />
        <FieldValue
          label={tr("納品方法")}
          value={<DeliveryMethodBadge method={note.deliveryMethod} />}
        />
        <FieldValue
          label={tr("価格記載")}
          value={
            <Badge color={note.includePrice ? "green" : "gray"} variant="light">
              {note.includePrice ? "あり" : tr("なし")}
            </Badge>
          }
        />
        <FieldValue label={tr("納品日")} value={fmt.date(note.deliveredAt)} />
        <FieldValue
          label={tr("合計金額")}
          value={
            note.includePrice ? (
              <MoneyText ta="left" value={note.totalAmount} />
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <ProcedurePanel
        active={active}
        handoffGroups={handoffGroups}
        sourceGroups={sourceGroups}
        stages={stages}
      />

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          明細（{note.items.length}）
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>製品</Table.Th>
                <Table.Th ta="right">{tr("数量")}</Table.Th>
                {note.includePrice && (
                  <>
                    <Table.Th ta="right">{tr("単価")}</Table.Th>
                    <Table.Th ta="right">{tr("金額")}</Table.Th>
                  </>
                )}
                <Table.Th>{tr("備考")}</Table.Th>
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
                  <Table.Td fw={700}>{tr("合計")}</Table.Td>
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

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("概要")}</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("備考")}
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {note.notes || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: 未表示タブの iframe は読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="pdf">
          <PdfAttachmentPanel
            downloadHref={pdfUrl("&download=1")}
            emptyAction={
              note.status === "DRAFT" ? (
                <PrimaryButton
                  leftSection={<IconCheck size={14} />}
                  onClick={() => setIssueOpen(true)}
                >
                  {tr("発行")}
                </PrimaryButton>
              ) : undefined
            }
            emptyMessage={tr("発行後に PDF を閲覧できます。")}
            file={pdfFile}
            filename={pdfFilename}
            onRegenerate={regenerate}
            previewSrc={canViewPdf ? pdfUrl(`&v=${pdfNonce}`) : undefined}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("発行")}
        loading={isPending}
        message={`納品書 ${note.deliveryNumber} を発行します。発行後は編集できません。`}
        onClose={() => setIssueOpen(false)}
        onConfirm={() =>
          run(
            () => issueDeliveryNote(note.deliveryNumber),
            tr("発行しました"),
            `納品書 ${note.deliveryNumber} を発行しました`,
          )
        }
        opened={issueOpen}
        title={tr("発行の確認")}
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("納品済みにする")}
        loading={isPending}
        message={`納品書 ${note.deliveryNumber} を納品済みにします。納品日は本日で記録されます。`}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() =>
          run(
            () => markDelivered(note.deliveryNumber),
            tr("納品済みにしました"),
            `納品書 ${note.deliveryNumber} を納品済みにしました`,
          )
        }
        opened={deliverOpen}
        title={tr("納品の確認")}
      />
    </DetailShell>
  );
}
