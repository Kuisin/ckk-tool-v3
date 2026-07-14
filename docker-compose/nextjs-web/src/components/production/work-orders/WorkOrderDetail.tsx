"use client";

/**
 * WorkOrderDetail — 指示書 詳細 (PD22) / 承認詳細 (PD23) (design.md §8.2)。
 *
 * サマリ + ApprovalStatusPanel (§12.4) + 工程ワークフロー表示 (§12.2) +
 * Tabs（概要 / 関連 / 履歴）。variant="approval" は承認管理 (PD03) から開く
 * 承認画面 — タイトル「承認」で ApprovalStatusPanel を最上部に出し、
 * 編集系アクションは出さない。
 *
 * アクション: 編集（DRAFT のみ）/ コピー（対象注文請書を選ぶモーダル。コピー元に
 * 新しい版があれば警告）/ キャンセル（DRAFT・承認待ちのみ）。
 */

import { Alert, Anchor, Stack, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconCopy, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchSalesOrderOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  cancelWorkOrder,
  copyWorkOrder,
} from "@/app/(dashboard)/production/work-orders/actions";
import {
  ApprovalStatusPanel,
  type ApprovalTrailView,
} from "@/components/production/ApprovalStatusPanel";
import { WorkOrderStepsPanel } from "@/components/production/WorkOrderStepsPanel";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ModalShell, openConfirm } from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { WORK_ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";
import type { WorkOrderView } from "./model";

const BASE_PATH = "/production/work-orders";
const SALES_ORDERS_PATH = "/production/sales-orders";

export function WorkOrderDetail({
  workOrder,
  auditEntries,
  canApproveFirst,
  canApproveSecond,
  approvalTrail = [],
  catalogOptions = [],
  variant = "default",
}: {
  workOrder: WorkOrderView;
  auditEntries: AuditEntry[];
  canApproveFirst: boolean;
  canApproveSecond: boolean;
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
  /** 分岐追加モーダル用の工程カタログ options（詳細画面のみ）。 */
  catalogOptions?: { value: string; label: string }[];
  /** "approval" = 承認管理 (PD03) からの承認画面。 */
  variant?: "default" | "approval";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetSoId, setCopyTargetSoId] = useState<string | null>(
    workOrder.salesOrderId,
  );

  const wo = workOrder;
  const isApproval = variant === "approval";
  const canEdit = wo.status === "DRAFT";
  const canCancel = wo.status === "DRAFT" || wo.status === "PENDING_APPROVAL";

  const handleCopy = () => {
    startTransition(async () => {
      const result = await copyWorkOrder(
        wo.workOrderNumber,
        copyTargetSoId ?? "",
      );
      if (result.ok) {
        notifications.show({
          title: "コピーしました",
          message: `指示書 #${result.data.workOrderNumber} を作成しました`,
          color: "green",
        });
        setCopyOpen(false);
        router.push(`${BASE_PATH}/${result.data.workOrderNumber}`);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleCancel = () => {
    openConfirm({
      title: "キャンセルの確認",
      message: `指示書 #${wo.workOrderNumber} をキャンセルします。この操作は取り消せません。`,
      confirmLabel: "キャンセルする",
      onConfirm: () => {
        startTransition(async () => {
          const result = await cancelWorkOrder(wo.workOrderNumber);
          if (result.ok) {
            notifications.show({
              title: "キャンセルしました",
              message: `指示書 #${wo.workOrderNumber}`,
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
      },
    });
  };

  const approvalPanel = (
    <ApprovalStatusPanel
      approvalStatus={wo.approvalStatus}
      canApproveFirst={canApproveFirst}
      canApproveSecond={canApproveSecond}
      history={wo.history}
      rejectReason={wo.rejectReason}
      status={wo.status}
      trail={approvalTrail}
      workOrderNumber={wo.workOrderNumber}
    />
  );

  const summary = (
    <SummaryGrid>
      <FieldValue
        label="注文請書番号"
        value={
          <Anchor
            component={Link}
            href={`${SALES_ORDERS_PATH}/${wo.salesOrderNumber}`}
            size="sm"
          >
            <DocNumber c="blue">{wo.salesOrderNumber}</DocNumber>
          </Anchor>
        }
      />
      <FieldValue label="顧客" value={wo.customerName} />
      <FieldValue label="製品" value={wo.productName} />
      <FieldValue
        label="種別"
        value={WORK_ORDER_TYPE_LABEL[wo.type] ?? wo.type}
      />
      <FieldValue label="予定数量" value={`${wo.plannedQuantity}`} />
      <FieldValue
        label="使用素材"
        value={
          wo.materialCode ? `${wo.materialCode}（${wo.materialName}）` : null
        }
      />
      <FieldValue
        label="ロット番号"
        value={<DocNumber>{wo.lotNumber ?? wo.workOrderNumber}</DocNumber>}
      />
      <FieldValue
        label="コピー元"
        value={
          wo.sourceWorkOrderNumber != null ? (
            <Anchor
              component={Link}
              href={`${BASE_PATH}/${wo.sourceWorkOrderNumber}`}
              size="sm"
            >
              <DocNumber c="blue">#{wo.sourceWorkOrderNumber}</DocNumber>
            </Anchor>
          ) : null
        }
      />
      <FieldValue
        label="検査表"
        value={
          wo.inspectionTemplates.length > 0
            ? wo.inspectionTemplates.map((t) => t.name).join(" / ")
            : null
        }
      />
    </SummaryGrid>
  );

  return (
    <DetailShell
      actions={
        isApproval ? undefined : (
          <ResourceActions
            menuItems={[
              {
                label: "コピー",
                icon: <IconCopy size={14} />,
                onClick: () => setCopyOpen(true),
              },
              ...(canCancel
                ? [
                    {
                      label: "キャンセル",
                      icon: <IconX size={14} />,
                      color: "red",
                      divider: true,
                      onClick: handleCancel,
                    },
                  ]
                : []),
            ]}
            onEdit={
              canEdit
                ? () => router.push(`${BASE_PATH}/${wo.workOrderNumber}/edit`)
                : undefined
            }
          />
        )
      }
      breadcrumbs={
        isApproval
          ? [
              "生産",
              { label: "承認管理", href: "/production/approvals" },
              `#${wo.workOrderNumber}`,
            ]
          : [
              "生産",
              { label: "指示書", href: BASE_PATH },
              `#${wo.workOrderNumber}`,
            ]
      }
      createdAt={formatDateTime(wo.createdAt)}
      status={
        <>
          <StatusBadge entity="WorkOrder" status={wo.status} />
          {wo.approvalStatus !== "NONE" && (
            <StatusBadge
              entity="WorkOrderApproval"
              status={wo.approvalStatus}
            />
          )}
        </>
      }
      title={
        isApproval
          ? `承認 #${wo.workOrderNumber}`
          : `指示書 #${wo.workOrderNumber}`
      }
      updatedAt={formatDateTime(wo.updatedAt)}
    >
      {/* 承認画面は承認状況を最上部に */}
      {isApproval ? (
        <>
          {approvalPanel}
          {summary}
        </>
      ) : (
        <>
          {summary}
          {approvalPanel}
        </>
      )}

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            <WorkOrderStepsPanel
              catalogOptions={catalogOptions}
              stepLinks={wo.stepLinks}
              steps={wo.steps}
              workOrderNumber={wo.workOrderNumber}
              workOrderStatus={wo.status}
            />
            {wo.notes && (
              <div>
                <Text c="dimmed" mb={4} size="xs">
                  備考
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {wo.notes}
                </Text>
              </div>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                注文請書
              </Text>
              <Anchor
                component={Link}
                href={`${SALES_ORDERS_PATH}/${wo.salesOrderNumber}`}
                size="sm"
              >
                <DocNumber c="blue">{wo.salesOrderNumber}</DocNumber>
              </Anchor>
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                コピー（この指示書から作成）
              </Text>
              {wo.copies.length > 0 ? (
                <Stack gap={4}>
                  {wo.copies.map((c) => (
                    <Anchor
                      component={Link}
                      href={`${BASE_PATH}/${c.workOrderNumber}`}
                      key={c.workOrderNumber}
                      size="sm"
                    >
                      <DocNumber c="blue">
                        #{c.workOrderNumber}（{formatDateTime(c.createdAt)}）
                      </DocNumber>
                    </Anchor>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  —
                </Text>
              )}
            </div>
            {wo.sourceWorkOrderNumber != null && (
              <div>
                <Text c="dimmed" mb={4} size="xs">
                  コピー元
                </Text>
                <Anchor
                  component={Link}
                  href={`${BASE_PATH}/${wo.sourceWorkOrderNumber}`}
                  size="sm"
                >
                  <DocNumber c="blue">#{wo.sourceWorkOrderNumber}</DocNumber>
                </Anchor>
              </div>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ModalShell
        confirmLabel="コピー作成"
        loading={isPending}
        onClose={() => setCopyOpen(false)}
        onConfirm={handleCopy}
        opened={copyOpen}
        size="md"
        title={`指示書 #${wo.workOrderNumber} をコピー`}
      >
        <Stack gap="sm">
          {wo.copies.length > 0 && (
            <Alert
              color="yellow"
              icon={<IconAlertTriangle size={16} />}
              variant="light"
            >
              新しい版が存在します（#
              {wo.copies.map((c) => c.workOrderNumber).join(", #")}）。
              最新版のコピーを検討してください。
            </Alert>
          )}
          <SearchSelect
            initialOption={{
              value: wo.salesOrderId,
              label: `${wo.salesOrderNumber} ${wo.productName}（${wo.salesOrderQuantity}）`,
            }}
            label="対象注文請書"
            onChange={setCopyTargetSoId}
            onSearch={searchSalesOrderOptions}
            placeholder="注文請書番号・製品・顧客で検索"
            storageKey="sales-order"
            value={copyTargetSoId}
            withAsterisk
          />
          <Text c="dimmed" size="xs">
            工程・実施場所・検査表を引き継いだ下書きを作成します。
          </Text>
        </Stack>
      </ModalShell>
    </DetailShell>
  );
}
