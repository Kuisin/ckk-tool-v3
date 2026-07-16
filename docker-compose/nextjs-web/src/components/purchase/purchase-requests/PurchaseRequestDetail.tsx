"use client";

/**
 * PurchaseRequestDetail — 購買依頼 詳細 (PU24, design.md §8.2)。
 *
 * SummaryGrid + 承認/変換パネル（線形 Stepper 依頼→承認→発注書へ変換 +
 * 状態別アクション）+ Tabs（明細 / 概要 / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT / REJECTED: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認（isApprover("FIRST") ゲート）/ 差し戻し（理由必須 → REJECTED）
 *   APPROVED: 発注書へ変換（仕入先を指定 → 発注書 DRAFT を生成）/ キャンセル
 *   ORDERED: 変換先の発注書へのリンク表示
 */

import {
  Alert,
  Anchor,
  Badge,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconSend,
  IconShoppingCart,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approvePurchaseRequest,
  cancelPurchaseRequest,
  convertToPurchaseOrder,
  rejectPurchaseRequest,
  requestPurchaseRequestApproval,
} from "@/app/(dashboard)/purchase/purchase-requests/actions";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/production/ApprovalStatusPanel";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ModalShell } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import {
  canRequestApproval,
  isCancellable,
  isEditable,
  PURCHASE_REQUEST_HISTORY_ACTION_LABEL,
  type PurchaseRequestView,
} from "./model";

const BASE_PATH = "/purchase/purchase-requests";
const PO_PATH = "/purchase/purchase-orders";

interface Option {
  value: string;
  label: string;
}

/** status → Stepper の active index（依頼 / 承認 / 発注書へ変換）。 */
function stepperActive(status: string): number {
  switch (status) {
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
      return -1; // CANCELLED
  }
}

export function PurchaseRequestDetail({
  purchaseRequest,
  auditEntries,
  canApprove,
  supplierOptions,
  approvalTrail = [],
}: {
  purchaseRequest: PurchaseRequestView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 第一承認グループのメンバー（or 代理）か（承認 / 差し戻しのゲート）。 */
  canApprove: boolean;
  /** 仕入先（VENDOR ロールの有効 BP）— 変換モーダルの Select。value = uuid。 */
  supplierOptions: Option[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("items");
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertSupplier, setConvertSupplier] = useState<string | null>(null);

  const rq = purchaseRequest;

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `購買依頼 ${rq.requestNumber}`,
          color: "green",
        });
        setRejectOpen(false);
        setRejectReason("");
        setCancelOpen(false);
        setCancelReason("");
        setConvertOpen(false);
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

  const handleConvert = () => {
    if (!convertSupplier) {
      notifications.show({
        title: "エラー",
        message: "仕入先を選択してください",
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
          title: "発注書へ変換しました",
          message: `素材発注書 ${result.data.poNumber} を作成しました`,
          color: "green",
        });
        setConvertOpen(false);
        router.push(`${PO_PATH}/${result.data.poNumber}`);
      } else {
        notifications.show({
          title: "エラー",
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

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={
            isCancellable(rq)
              ? [
                  {
                    label: "キャンセル",
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
      breadcrumbs={["購買", { label: "購買依頼", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(rq.createdAt)}
      status={<StatusBadge entity="PurchaseRequest" status={rq.status} />}
      title={rq.requestNumber}
      updatedAt={formatDateTime(rq.updatedAt)}
    >
      <SummaryGrid>
        <FieldValue
          label="依頼番号"
          value={<DocNumber>{rq.requestNumber}</DocNumber>}
        />
        <FieldValue label="依頼者" value={rq.requesterName} />
        <FieldValue
          label="明細数"
          value={
            <Text className="tabular-nums" size="sm" span>
              {rq.items.length} 件
            </Text>
          }
        />
        <FieldValue label="依頼理由" value={rq.purpose ?? "—"} />
        <FieldValue
          label="依頼日時"
          value={rq.requestedAt ? formatDateTime(rq.requestedAt) : "—"}
        />
        <FieldValue
          label="承認日時"
          value={rq.approvedAt ? formatDateTime(rq.approvedAt) : "—"}
        />
        {rq.purchaseOrderNumber && (
          <FieldValue
            label="変換先発注書"
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

      {/* 承認 / 変換パネル — 素材発注書の承認パネルと同型（線形 3 段階） */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="md" order={5}>
          承認・変換状況
        </Title>

        <Stepper active={stepperActive(rq.status)} size="sm">
          <Stepper.Step
            description={rq.requestedAt ? formatDate(rq.requestedAt) : "作成中"}
            label="依頼"
            loading={rq.status === "DRAFT" || rq.status === "REJECTED"}
          />
          <Stepper.Step
            description={
              rq.approvedAt ? formatDate(rq.approvedAt) : "第一承認グループ"
            }
            label="承認"
            loading={rq.status === "REQUESTED"}
          />
          <Stepper.Step
            description={
              rq.orderedAt ? formatDate(rq.orderedAt) : "仕入先を指定"
            }
            label="発注書へ変換"
            loading={rq.status === "APPROVED"}
          />
        </Stepper>

        {rq.status === "REJECTED" && (
          <Alert
            color="orange"
            icon={<IconArrowBackUp size={16} />}
            mt="md"
            title="差し戻されました"
            variant="light"
          >
            {lastReject?.notes ?? "—"}（編集して再度承認依頼できます）
          </Alert>
        )}

        {rq.status === "CANCELLED" && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            mt="md"
            title="キャンセル済"
            variant="light"
          >
            {rq.cancelReason ?? "—"}
          </Alert>
        )}

        <Group gap="xs" mt="md">
          {canRequestApproval(rq) && (
            <PrimaryButton
              leftSection={<IconSend size={14} />}
              loading={isPending}
              onClick={() =>
                run(
                  () => requestPurchaseRequestApproval(rq.requestNumber),
                  "承認依頼しました",
                )
              }
            >
              承認依頼
            </PrimaryButton>
          )}
          {rq.status === "REQUESTED" &&
            (canApprove ? (
              <>
                <ApproveButton
                  loading={isPending}
                  onClick={() =>
                    run(
                      () => approvePurchaseRequest(rq.requestNumber),
                      "承認しました",
                    )
                  }
                >
                  承認
                </ApproveButton>
                <RejectButton onClick={() => setRejectOpen(true)} />
              </>
            ) : (
              <Text c="dimmed" size="xs">
                第一承認グループのメンバーのみ承認・差し戻しできます
              </Text>
            ))}
          {rq.status === "APPROVED" && (
            <PrimaryButton
              leftSection={<IconShoppingCart size={14} />}
              loading={isPending}
              onClick={() => setConvertOpen(true)}
            >
              発注書へ変換
            </PrimaryButton>
          )}
          {rq.status === "ORDERED" && rq.purchaseOrderNumber && (
            <Anchor
              component={Link}
              href={`${PO_PATH}/${rq.purchaseOrderNumber}`}
              size="sm"
            >
              <Group gap={4} wrap="nowrap">
                <IconShoppingCart size={14} />
                <span>素材発注書 {rq.purchaseOrderNumber} を確認する</span>
              </Group>
            </Anchor>
          )}
        </Group>

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
                    {PURCHASE_REQUEST_HISTORY_ACTION_LABEL[h.action] ??
                      h.action}
                  </Badge>
                  <Text size="xs">{h.user}</Text>
                  <Text c="dimmed" className="tabular-nums" size="xs">
                    {formatDateTime(h.at)}
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
      </Paper>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="items">明細（{rq.items.length}）</Tabs.Tab>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="items">
          <Table.ScrollContainer minWidth={680}>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>素材</Table.Th>
                  <Table.Th>入荷先工場</Table.Th>
                  <Table.Th ta="right">数量</Table.Th>
                  <Table.Th>希望納期</Table.Th>
                  <Table.Th>備考</Table.Th>
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
                    <Table.Td>{it.factoryName ?? "—"}</Table.Td>
                    <Table.Td className="tabular-nums" ta="right">
                      {it.quantity} {it.unit}
                    </Table.Td>
                    <Table.Td className="tabular-nums">
                      {formatDate(it.desiredAt)}
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
                依頼理由
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {rq.purpose || "—"}
              </Text>
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                備考
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
      </Tabs>

      {/* 差し戻し（理由必須 → REJECTED — 編集して再依頼可能） */}
      <ModalShell
        confirmColor="red"
        confirmLabel="差し戻す"
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            notifications.show({
              title: "エラー",
              message: "差し戻し理由を入力してください",
              color: "red",
            });
            return;
          }
          run(
            () => rejectPurchaseRequest(rq.requestNumber, rejectReason),
            "差し戻しました",
          );
        }}
        opened={rejectOpen}
        size="sm"
        title="差し戻しの確認"
      >
        <Textarea
          autosize
          label="差し戻し理由"
          minRows={3}
          onChange={(e) => setRejectReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={rejectReason}
          withAsterisk
        />
      </ModalShell>

      {/* キャンセル（変換前のみ・理由必須） */}
      <ModalShell
        confirmColor="red"
        confirmLabel="キャンセルする"
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          if (!cancelReason.trim()) {
            notifications.show({
              title: "エラー",
              message: "キャンセル理由を入力してください",
              color: "red",
            });
            return;
          }
          run(
            () => cancelPurchaseRequest(rq.requestNumber, cancelReason),
            "キャンセルしました",
          );
        }}
        opened={cancelOpen}
        size="sm"
        title="キャンセルの確認"
      >
        <Text size="sm">
          購買依頼 {rq.requestNumber}{" "}
          をキャンセルします。この操作は取り消せません。
        </Text>
        <Textarea
          autosize
          label="キャンセル理由"
          minRows={3}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          placeholder="理由を入力"
          value={cancelReason}
          withAsterisk
        />
      </ModalShell>

      {/* 発注書へ変換（仕入先必須 — 依頼は仕入先を持たない） */}
      <ModalShell
        confirmLabel="変換する"
        loading={isPending}
        onClose={() => setConvertOpen(false)}
        onConfirm={handleConvert}
        opened={convertOpen}
        size="sm"
        title="発注書へ変換の確認"
      >
        <Text mb="sm" size="sm">
          購買依頼 {rq.requestNumber} の明細 {rq.items.length}{" "}
          件から素材発注書（下書き）を作成します。単価は発注書側で入力してください。
        </Text>
        <Select
          clearable
          data={supplierOptions}
          label="仕入先"
          onChange={setConvertSupplier}
          placeholder="仕入先を選択"
          searchable
          value={convertSupplier}
          withAsterisk
        />
      </ModalShell>
    </DetailShell>
  );
}
