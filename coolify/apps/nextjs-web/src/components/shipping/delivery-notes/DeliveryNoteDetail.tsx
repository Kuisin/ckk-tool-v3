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
  Alert,
  Anchor,
  Badge,
  Paper,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconDownload,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { downloadFile } from "@/lib/download";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { statusLabel } from "@/lib/status-map";
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
  const tr = useTranslations();
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
  // ユーザー直送で価格記載ありの納品書は、最終需要家へ渡すと事故になる
  // （届けるべき相手は顧客）。開く／ダウンロードの前に一度確認を挟む。
  const showsPriceToDirectUser =
    note.deliveryMethod === "DIRECT_TO_USER" && note.includePrice;
  const confirmBeforePdf = (action: () => void) => {
    if (!showsPriceToDirectUser) {
      action();
      return;
    }
    modals.openConfirmModal({
      title: tr("shipping.deliveryNotes.confirmOpenWithPriceTitle"),
      children: (
        <Text size="sm">
          {tr("shipping.deliveryNotes.confirmOpenWithPriceBody")}
        </Text>
      ),
      labels: {
        confirm: tr("common.openThePdf"),
        cancel: tr("common.cancel"),
      },
      confirmProps: { color: "orange" },
      onConfirm: action,
    });
  };
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(pdfMeta);
  // 再生成でプレビューの iframe を貼り替えるためのキャッシュバスター。
  const [pdfNonce, setPdfNonce] = useState(0);

  const pdfUrl = (extra = "") =>
    `/api/pdf/delivery-note?id=${encodeURIComponent(note.id)}${extra}`;

  // ── 手続き状況（下書き → 発行 → 納品済）─────────────────────────────────
  const stages: ProcedureStage[] = [
    {
      key: "draft",
      label: tr("common.draft"),
      description: fmt.date(note.createdAt),
      loading: note.status === "DRAFT",
    },
    {
      key: "issued",
      label: tr("common.issue"),
      description:
        note.status === "DRAFT"
          ? tr("billing.invoices.issueThePdf")
          : tr("common.issued2"),
      loading: note.status === "ISSUED",
    },
    {
      key: "delivered",
      label: tr("shipping.deliveryNotes.delivered"),
      description: note.deliveredAt
        ? fmt.date(note.deliveredAt)
        : tr("shipping.deliveryNotes.confirmDelivery"),
    },
  ];
  const active = note.status === "DRAFT" ? 0 : note.status === "ISSUED" ? 1 : 3;

  // 上流 = 出荷書（1 件）と、そこに束ねられた注文明細。
  const sourceGroups: HandoffGroup[] = [
    {
      key: "delivery-order",
      title: tr("common.deliveryOrder"),
      items: [
        {
          key: note.deliveryOrderNumber,
          label: note.deliveryOrderNumber,
          href: `/shipping/delivery-orders/${note.deliveryOrderNumber}`,
          note: tr("shipping.deliveryNotes.whereThisDeliveryNoteShipsFrom"),
        },
      ],
      emptyNote: "—",
    },
    {
      key: "order-lines",
      title: tr("common.orderLine"),
      summary:
        note.orderLineNumbers.length > 0
          ? tr("common.itemsCount", { count: note.orderLineNumbers.length })
          : null,
      items: note.orderLineNumbers.map((n) => ({
        key: n,
        label: n,
        href: `/sales/order-lines/${n}`,
      })),
      emptyNote: tr("shipping.deliveryNotes.stockStorageEtcNotTiedTo"),
    },
  ];

  // 下流 = この納品書を請求した請求書。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "invoices",
      title: tr("common.invoice"),
      items: invoices.map((inv) => ({
        key: inv.number,
        label: inv.number,
        href: `/billing/invoices/${inv.number}`,
        done: inv.status === "PAID",
        note: tr("shipping.deliveryNotes.invoiceNote", {
          status: statusLabel("Invoice", inv.status),
          amount: formatMoney(inv.totalAmount),
        }),
      })),
      emptyNote:
        note.status === "DELIVERED"
          ? tr("shipping.deliveryNotes.notBilledInvoicesAreMadeAt")
          : tr("shipping.deliveryNotes.notBilledBilledAtTheClosing"),
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
          title: tr("common.error2"),
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
                    label: tr("common.issue"),
                    icon: <IconCheck size={14} />,
                    onClick: () => setIssueOpen(true),
                  },
                ]
              : []),
            ...(note.status === "ISSUED"
              ? [
                  {
                    label: tr("shipping.deliveryNotes.markAsDelivered"),
                    icon: <IconTruckDelivery size={14} />,
                    onClick: () => setDeliverOpen(true),
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
                      confirmBeforePdf(
                        () =>
                          void downloadFile(pdfUrl("&download=1"), pdfFilename),
                      ),
                  },
                ]
              : []),
          ]}
          onEdit={
            isEditable(note)
              ? () => router.push(`${BASE_PATH}/${note.id}/edit`)
              : undefined
          }
          pdf={
            canViewPdf
              ? showsPriceToDirectUser
                ? {
                    onClick: () =>
                      confirmBeforePdf(() =>
                        window.open(pdfUrl(), "_blank", "noopener,noreferrer"),
                      ),
                  }
                : { href: pdfUrl() }
              : undefined
          }
        />
      }
      breadcrumbs={[
        tr("common.shipping"),
        { label: tr("common.deliveryNote"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(note.createdAt)}
      status={<StatusBadge entity="DeliveryNote" status={note.status} />}
      title={note.deliveryNumber}
      updatedAt={fmt.dateTime(note.updatedAt)}
    >
      {showsPriceToDirectUser && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          title={tr("shipping.deliveryNotes.confirmOpenWithPriceTitle")}
          variant="light"
        >
          {tr("shipping.deliveryNotes.directToUserPriceWarning")}
        </Alert>
      )}
      <SummaryGrid>
        <FieldValue
          label={tr("common.deliveryNoteNumber")}
          value={<DocNumber>{note.deliveryNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("common.deliveryOrderNumber")}
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
          label={tr("common.orderLineNumber")}
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
          label={tr("common.shipTo")}
          value={
            note.recipientBranchName
              ? `${note.recipientName} / ${note.recipientBranchName}`
              : note.recipientName
          }
        />
        <FieldValue
          label={tr("shipping.deliveryNotes.shipToEndUser")}
          value={
            note.deliveryMethod === "DIRECT_TO_USER"
              ? (note.endUserName ?? "—")
              : "—"
          }
        />
        <FieldValue label={tr("common.salesRep")} value={note.salesRepName} />
        <FieldValue label={tr("common.createdBy")} value={note.createdByName} />
        <FieldValue
          label={tr("shipping.deliveryNotes.deliveryMethod")}
          value={<DeliveryMethodBadge method={note.deliveryMethod} />}
        />
        <FieldValue
          label={tr("shipping.deliveryNotes.showPrices")}
          value={
            <Badge color={note.includePrice ? "green" : "gray"} variant="light">
              {note.includePrice ? tr("common.included") : tr("common.none2")}
            </Badge>
          }
        />
        <FieldValue
          label={tr("common.deliveredDate")}
          value={fmt.date(note.deliveredAt)}
        />
        <FieldValue
          label={tr("common.totalAmount")}
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
          {tr("common.lineItemsWithCount", { count: note.items.length })}
        </Title>
        <Table.ScrollContainer minWidth={560}>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.product")}</Table.Th>
                <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                {note.includePrice && (
                  <>
                    <Table.Th ta="right">{tr("common.unitPrice")}</Table.Th>
                    <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                  </>
                )}
                <Table.Th>{tr("common.notes")}</Table.Th>
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
                  <Table.Td fw={700}>{tr("common.total")}</Table.Td>
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
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.notes")}
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

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("common.issue")}
        loading={isPending}
        message={tr("shipping.deliveryNotes.confirmIssueBody", {
          number: note.deliveryNumber,
        })}
        onClose={() => setIssueOpen(false)}
        onConfirm={() =>
          run(
            () => issueDeliveryNote(note.deliveryNumber),
            tr("common.issued"),
            tr("shipping.deliveryNotes.issuedBody", {
              number: note.deliveryNumber,
            }),
          )
        }
        opened={issueOpen}
        title={tr("common.confirmIssue")}
      />
      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("shipping.deliveryNotes.markAsDelivered")}
        loading={isPending}
        message={tr("shipping.deliveryNotes.confirmDeliveredBody", {
          number: note.deliveryNumber,
        })}
        onClose={() => setDeliverOpen(false)}
        onConfirm={() =>
          run(
            () => markDelivered(note.deliveryNumber),
            tr("shipping.deliveryNotes.markedAsDelivered"),
            tr("shipping.deliveryNotes.deliveredBody", {
              number: note.deliveryNumber,
            }),
          )
        }
        opened={deliverOpen}
        title={tr("shipping.deliveryNotes.confirmDelivery")}
      />
    </DetailShell>
  );
}
