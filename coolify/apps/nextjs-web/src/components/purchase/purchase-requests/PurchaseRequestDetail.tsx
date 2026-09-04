"use client";

/**
 * PurchaseRequestDetail — 購買依頼 詳細 (PU21, design.md §8.2)。
 *
 * 最上部の ActionCard（いまやること — 権限で色が変わる）+ SummaryGrid +
 * 手続き状況（ProcedurePanel — 依頼→承認→発注書へ変換、素材発注書 →）
 * + Tabs（明細 / 概要 / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT / REJECTED: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認 / 差し戻し（理由必須 → REJECTED）— 段数は承認設定 MS0B
 *   APPROVED: 発注書へ変換（仕入先を指定 → 発注書 DRAFT を生成）/ キャンセル
 *   ORDERED: 変換先の発注書へのリンク表示
 */

import {
  Anchor,
  Badge,
  Divider,
  Group,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconShoppingCart, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import {
  approvePurchaseRequest,
  cancelPurchaseRequest,
  convertToPurchaseOrder,
  rejectPurchaseRequest,
  requestPurchaseRequestApproval,
} from "@/app/(dashboard)/purchase/purchase-requests/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/production/ApprovalStatusPanel";
import { ActionCard } from "@/components/ui/ActionCard";
import { AppTabs } from "@/components/ui/AppTabs";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ModalShell } from "@/components/ui/modals";
import {
  approvalStage,
  type HandoffGroup,
  ProcedurePanel,
  procedureStages,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { ActionResult } from "@/lib/server-action";
import {
  canRequestApproval,
  isCancellable,
  isEditable,
  type PurchaseRequestView,
} from "./model";

const BASE_PATH = "/purchase/purchase-requests";
const PO_PATH = "/purchase/purchase-orders";

interface Option {
  value: string;
  label: string;
}

/**
 * status → いま留まっている段（依頼 / 承認 / 発注書へ変換）。
 * キャンセルは**進んだところまで**を返す（残りは skipped で描く）。
 */
function currentStage(rq: {
  status: string;
  requestedAt: string | null;
  approvedAt: string | null;
}): number {
  switch (rq.status) {
    case "DRAFT":
    case "REJECTED":
      return 0;
    case "REQUESTED":
      return 1;
    case "APPROVED":
      return 2;
    case "ORDERED":
      return 3;
    default:
      // CANCELLED
      if (rq.approvedAt) return 2;
      if (rq.requestedAt) return 1;
      return 0;
  }
}

export function PurchaseRequestDetail({
  purchaseRequest,
  auditEntries,
  approval,
  supplierOptions,
  approvalTrail = [],
}: {
  purchaseRequest: PurchaseRequestView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 承認フローの現在状態（承認 / 差し戻しのゲートと表示）。 */
  approval: ApprovalActionState;
  /** 仕入先（VENDOR ロールの有効 BP）— 変換モーダルの Select。value = uuid。 */
  supplierOptions: Option[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSupplier, setConvertSupplier] = useState<string | null>(null);

  const rq = purchaseRequest;

  /** history Json の action → 表示ラベル。 */
  const historyActionLabel: Record<string, string> = {
    CREATE: tr("common.create2"),
    UPDATE: tr("common.update"),
    REQUEST_APPROVAL: tr("common.approvalRequest"),
    APPROVE: tr("common.approve"),
    REJECT: tr("common.reject"),
    CONVERT: tr("purchase.purchaseRequests.convertToAPurchaseOrder"),
    CANCEL: tr("common.cancel"),
  };

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `${tr("common.purchaseRequest")} ${rq.requestNumber}`,
          color: "green",
        });
        setCancelOpen(false);
        setCancelReason("");
        setConvertOpen(false);
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

  const handleConvert = () => {
    if (!convertSupplier) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("purchase.purchaseRequests.selectASupplier"),
        color: "red",
      });
      return;
    }
    const supplierBpId = convertSupplier;
    startTransition(async () => {
      const result = await convertToPurchaseOrder(
        rq.requestNumber,
        supplierBpId,
      );
      if (result.ok) {
        notifications.show({
          title: tr("purchase.purchaseRequests.convertedToAPurchaseOrder"),
          message: tr("purchase.purchaseRequests.createdPurchaseOrder", {
            number: result.data.poNumber,
          }),
          color: "green",
        });
        setConvertOpen(false);
        router.push(`${PO_PATH}/${result.data.poNumber}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  // 遷移履歴は新しい順で表示
  const records = [...rq.history].reverse();
  // 差し戻し中の表示用: 最新の REJECT エントリの理由
  const lastReject = records.find((h) => h.action === "REJECT");

  // ── 手続き状況（依頼 → 承認 → 発注書へ変換）─────────────────────────────
  const stages = procedureStages(
    [
      {
        key: "requested",
        label: tr("common.request"),
        description: rq.requestedAt
          ? fmt.date(rq.requestedAt)
          : tr("common.draft"),
        // 差し戻し中は赤（_specs/design.md §9 REJECTED = red）。
        color: rq.status === "REJECTED" ? "red" : undefined,
      },
      approvalStage(approval, {
        approvedAt: rq.approvedAt,
        fmtDate: (v) => fmt.date(v),
        tr,
      }),
      {
        key: "ordered",
        label: tr("purchase.purchaseRequests.convertToAPurchaseOrder"),
        description: rq.orderedAt
          ? fmt.date(rq.orderedAt)
          : tr("purchase.purchaseRequests.specifyASupplier"),
      },
    ],
    currentStage(rq),
    { stopped: rq.status === "CANCELLED" },
  );

  // 下流 = 変換で生成した素材発注書（1 依頼 = 1 発注書）。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "purchase-order",
      title: tr("common.materialPurchaseOrder"),
      items: rq.purchaseOrderNumber
        ? [
            {
              key: rq.purchaseOrderNumber,
              label: rq.purchaseOrderNumber,
              href: `${PO_PATH}/${rq.purchaseOrderNumber}`,
              done: true,
              note: tr("purchase.purchaseRequests.generatedFromThisRequest"),
            },
          ]
        : [],
      emptyNote:
        rq.status === "APPROVED"
          ? tr("purchase.purchaseRequests.notConvertedChooseASupplierTo")
          : tr("purchase.purchaseRequests.notConvertedBecomesAPurchaseOrder"),
    },
  ];

  /**
   * 「いまやること」カード（最上部）。承認依頼中は承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認依頼中」表示。
   */
  let actionCard: ReactNode = null;
  if (canRequestApproval(rq) || rq.status === "REQUESTED") {
    // 依頼・承認・差し戻しは 4 書類共通のカードに任せる（段数は承認設定 MS0B）
    actionCard = (
      <ApprovalActionCard
        approval={approval}
        canRequest={canRequestApproval(rq)}
        onApprove={() => approvePurchaseRequest(rq.requestNumber)}
        onReject={(reason) => rejectPurchaseRequest(rq.requestNumber, reason)}
        onRequest={() => requestPurchaseRequestApproval(rq.requestNumber)}
        rejectReason={lastReject?.notes ?? null}
        subject={`${tr("common.purchaseRequest")} ${rq.requestNumber}`}
      />
    );
  } else if (rq.status === "APPROVED") {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconShoppingCart size={14} />}
            loading={isPending}
            onClick={() => setConvertOpen(true)}
          >
            {tr("purchase.purchaseRequests.convertToAPurchaseOrder")}
          </PrimaryButton>
        }
        description={tr(
          "purchase.purchaseRequests.choosingASupplierGeneratesADraft",
        )}
        icon={<IconShoppingCart size={20} />}
        title={tr("purchase.purchaseRequests.readyToConvertToAPurchase")}
        tone="action"
      />
    );
  }

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            isCancellable(rq)
              ? [
                  {
                    label: tr("common.cancel"),
                    icon: <IconX size={14} />,
                    color: "red",
                    onClick: () => setCancelOpen(true),
                  },
                ]
              : []
          }
          onEdit={
            isEditable(rq)
              ? () => router.push(`${BASE_PATH}/${rq.requestNumber}/edit`)
              : undefined
          }
        />
      }
      breadcrumbs={[
        tr("common.purchasing"),
        { label: tr("common.purchaseRequest"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(rq.createdAt)}
      status={<StatusBadge entity="PurchaseRequest" status={rq.status} />}
      title={rq.requestNumber}
      updatedAt={fmt.dateTime(rq.updatedAt)}
    >
      {actionCard}

      <SummaryGrid>
        <FieldValue
          label={tr("common.requestNumber")}
          value={<DocNumber>{rq.requestNumber}</DocNumber>}
        />
        <FieldValue label={tr("common.requester")} value={rq.requesterName} />
        <FieldValue
          label={tr("common.lineCount")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {tr("common.itemsCount", { count: rq.items.length })}
            </Text>
          }
        />
        <FieldValue
          label={tr("purchase.purchaseRequests.reasonForTheRequest")}
          value={rq.purpose ?? "—"}
        />
        <FieldValue
          label={tr("common.requestedAt")}
          value={rq.requestedAt ? fmt.dateTime(rq.requestedAt) : "—"}
        />
        <FieldValue
          label={tr("common.approvedAt")}
          value={rq.approvedAt ? fmt.dateTime(rq.approvedAt) : "—"}
        />
        {rq.purchaseOrderNumber && (
          <FieldValue
            label={tr("purchase.purchaseRequests.resultingPurchaseOrder")}
            value={
              <Anchor
                component={Link}
                href={`${PO_PATH}/${rq.purchaseOrderNumber}`}
                size="sm"
              >
                <DocNumber>{rq.purchaseOrderNumber}</DocNumber>
              </Anchor>
            }
          />
        )}
      </SummaryGrid>

      <ProcedurePanel
        cancelled={rq.status === "CANCELLED"}
        cancelledNote={rq.cancelReason}
        handoffGroups={handoffGroups}
        stages={stages}
      >
        {/* 承認記録 — approval_records 由来（代理は「（代理: 原承認者）」付き） */}
        {countTrailRecords(approvalTrail) > 0 && (
          <>
            <Divider my="md" />
            <ApprovalTrailList trail={approvalTrail} />
          </>
        )}

        {records.length > 0 && (
          <>
            <Divider my="md" />
            <Stack gap="xs">
              {records.map((h, i) => (
                <Group gap="sm" key={`${h.at}-${h.action}-${i}`} wrap="nowrap">
                  <Badge color="gray" size="sm" variant="light">
                    {historyActionLabel[h.action] ?? h.action}
                  </Badge>
                  <Text size="xs">{h.user}</Text>
                  <Text c="dimmed" className="tabular-nums" size="xs">
                    {fmt.dateTime(h.at)}
                  </Text>
                  {h.notes && (
                    <Text c="dimmed" size="xs" truncate>
                      {h.notes}
                    </Text>
                  )}
                </Group>
              ))}
            </Stack>
          </>
        )}
      </ProcedurePanel>

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">
            {tr("common.lineItemsWithCount", { count: rq.items.length })}
          </Tabs.Tab>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={680}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{tr("common.materials")}</Table.Th>
                  <Table.Th>{tr("common.receivingSite")}</Table.Th>
                  <Table.Th ta="right">{tr("common.quantity")}</Table.Th>
                  <Table.Th>{tr("common.requestedDate2")}</Table.Th>
                  <Table.Th>{tr("common.notes")}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rq.items.map((it) => (
                  <Table.Tr key={it.id}>
                    <Table.Td>
                      <Text ff="mono" size="sm">
                        {it.materialCode}
                      </Text>
                      <Text c="dimmed" size="xs">
                        {it.materialName}
                      </Text>
                    </Table.Td>
                    <Table.Td>{it.plantName ?? "—"}</Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {it.quantity} {it.unit}
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {fmt.date(it.desiredAt)}
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="xs">
                        {it.notes ?? "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("purchase.purchaseRequests.reasonForTheRequest")}
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {rq.purpose || "—"}
              </Text>
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.notes")}
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {rq.notes || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      {/* キャンセル（変換前のみ・理由必須） */}
      <ModalShell
        confirmColor="red"
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          if (!cancelReason.trim()) {
            notifications.show({
              title: tr("common.error2"),
              message: tr("common.enterAReasonForCancelling"),
              color: "red",
            });
            return;
          }
          run(
            () => cancelPurchaseRequest(rq.requestNumber, cancelReason),
            tr("common.cancelled"),
          );
        }}
        opened={cancelOpen}
        size="sm"
        title={tr("common.confirmCancellation")}
      >
        <Text size="sm">
          {tr("purchase.purchaseRequests.confirmCancelBody", {
            number: rq.requestNumber,
          })}
        </Text>
        <Textarea
          autosize
          label={tr("common.reasonForCancelling")}
          minRows={3}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          placeholder={tr("common.enterAReason")}
          value={cancelReason}
          withAsterisk
        />
      </ModalShell>

      {/* 発注書へ変換（仕入先必須 — 依頼は仕入先を持たない） */}
      <ModalShell
        confirmLabel={tr("purchase.purchaseRequests.convert")}
        loading={isPending}
        onClose={() => setConvertOpen(false)}
        onConfirm={handleConvert}
        opened={convertOpen}
        size="sm"
        title={tr(
          "purchase.purchaseRequests.confirmConvertingToAPurchaseOrder",
        )}
      >
        <Text mb="sm" size="sm">
          {tr("purchase.purchaseRequests.confirmConvertBody", {
            number: rq.requestNumber,
            count: rq.items.length,
          })}
        </Text>
        <Select
          clearable
          data={supplierOptions}
          label={tr("common.supplier")}
          onChange={setConvertSupplier}
          placeholder={tr("common.selectASupplier")}
          searchable
          value={convertSupplier}
          withAsterisk
        />
      </ModalShell>
    </DetailShell>
  );
}
