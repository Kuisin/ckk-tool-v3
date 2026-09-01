"use client";

/**
 * WorkOrderDetail — 指示書 詳細 (PD22) / 承認詳細 (PD23) (design.md §8.2)。
 *
 * 最上部の WorkOrderApprovalCard（いまやること — 権限で色が変わる）+
 * サマリ + ApprovalStatusPanel (§12.4) + 工程ワークフロー表示 (§12.2) +
 * Tabs（概要 / 関連 / 履歴）。variant="approval" は承認管理 (PD03) から開く
 * 承認画面 — タイトル「承認」で ApprovalStatusPanel を最上部に出し、
 * 編集系アクションは出さない。
 *
 * アクション: 編集（DRAFT のみ）/ コピー（対象注文明細を選ぶモーダル。コピー元に
 * 新しい版があれば警告）/ キャンセル（DRAFT・承認依頼中のみ）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCopy,
  IconPrinter,
  IconRuler2,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { searchAllocatableOrderLineOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  acknowledgeFlowChangeAction,
  cancelWorkOrder,
  copyWorkOrder,
  setWorkOrderDesignFile,
} from "@/app/(dashboard)/production/work-orders/actions";
import type { ApprovalActionState } from "@/components/approvals/ApprovalActionCard";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  type ApprovalTrailView,
  WorkOrderApprovalCard,
  WorkOrderProcedurePanel,
} from "@/components/production/ApprovalStatusPanel";
import type { ProductDesignFile } from "@/components/production/design-files/model";
import { WorkOrderFinalInspectionPanel } from "@/components/production/WorkOrderFinalInspectionPanel";
import { WorkOrderStepsPanel } from "@/components/production/WorkOrderStepsPanel";
import { AppTabs } from "@/components/ui/AppTabs";
import { GhostButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ModalShell, openConfirm } from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import type { MemoView } from "@/lib/document-memos";
import { workOrderTypeLabel } from "@/lib/enum-labels";
import { FlowChangeCard, type PendingFlowChangeView } from "./FlowChangeCard";
import type { WorkOrderView } from "./model";
import { WorkOrderLinksCard } from "./WorkOrderLinksCard";

const BASE_PATH = "/production/work-orders";
const SALES_ORDERS_PATH = "/sales/order-lines";

export function WorkOrderDetail({
  workOrder,
  auditEntries,
  approval,
  approvalTrail = [],
  catalogOptions = [],
  memos = [],
  flowChange = null,
  flowChangeApproval = null,
  rejectedAppliedFlowChange = null,
  designFile = null,
  designPinned = false,
  variant = "default",
}: {
  workOrder: WorkOrderView;
  auditEntries: AuditEntry[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos?: MemoView[];
  approval: ApprovalActionState;
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
  /** 分岐追加モーダル用の工程カタログ options（詳細画面のみ）。 */
  catalogOptions?: { value: string; label: string }[];
  /** この指示書の製品の最新の主図面（無ければ null）。 */
  designFile?: ProductDesignFile | null;
  /** その版に固定されているか（false = 表示のたびに最新を引いている）。 */
  designPinned?: boolean;
  /** 承認依頼中の工程フロー変更（承認設定が未設定なら常に null = 即適用）。 */
  flowChange?: PendingFlowChangeView | null;
  /** 上の変更そのものの承認状態（指示書の承認とは別物）。 */
  flowChangeApproval?: ApprovalActionState | null;
  /** 事後承認（POST）で差し戻されたが適用済み・未確認の変更（赤アラート）。 */
  rejectedAppliedFlowChange?: {
    id: string;
    summary: string;
    resolvedAt: string | null;
  } | null;
  /** "approval" = 承認管理 (PD03) からの承認画面。 */
  variant?: "default" | "approval";
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargetSoId, setCopyTargetSoId] = useState<string | null>(
    workOrder.orderLines[0]?.orderLineId ?? null,
  );

  const wo = workOrder;
  // 表示番号 YYYYMMDD-XXXXX（保存側は従来どおり通し連番の int）。
  const woLabel = wo.docNumber;
  const isApproval = variant === "approval";
  const canEdit = wo.status === "DRAFT";
  const canCancel = wo.status === "DRAFT" || wo.status === "PENDING_APPROVAL";

  // 図面の固定 / 解除。任意の操作なので、失敗しても指示書側は何も変えない。
  const onToggleDesignPin = (designFileId: string | null) => {
    startTransition(async () => {
      const res = await setWorkOrderDesignFile(
        wo.workOrderNumber,
        designFileId,
      );
      if (res.ok) {
        notifications.show({
          title: designFileId
            ? "固定しました"
            : tr("production.workOrders.unpinned"),
          message: "",
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error ?? tr("common.failed"),
          color: "red",
        });
      }
    });
  };

  const handleCopy = () => {
    startTransition(async () => {
      const result = await copyWorkOrder(
        wo.workOrderNumber,
        copyTargetSoId ?? "",
      );
      if (result.ok) {
        notifications.show({
          title: tr("common.copied"),
          message: `指示書 ${result.data.docNumber} を作成しました`,
          color: "green",
        });
        setCopyOpen(false);
        router.push(`${BASE_PATH}/${result.data.workOrderNumber}`);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const handleCancel = () => {
    openConfirm({
      title: tr("common.confirmCancellation"),
      message: `指示書 ${woLabel} をキャンセルします。この操作は取り消せません。`,
      confirmLabel: tr("common.cancelDocument"),
      onConfirm: () => {
        startTransition(async () => {
          const result = await cancelWorkOrder(wo.workOrderNumber);
          if (result.ok) {
            notifications.show({
              title: tr("common.cancelled"),
              message: `指示書 ${woLabel}`,
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
      },
    });
  };

  // 状態別の操作は最上部のカードへ（承認権限の有無で色が変わる）。
  const approvalCard = (
    <WorkOrderApprovalCard
      approval={approval}
      rejectReason={wo.rejectReason}
      status={wo.status}
      workOrderNumber={wo.workOrderNumber}
    />
  );

  const approvalPanel = (
    <WorkOrderProcedurePanel
      approval={approval}
      history={wo.history}
      rejectReason={wo.rejectReason}
      trail={approvalTrail}
      workOrder={wo}
    />
  );

  const summary = (
    <SummaryGrid>
      <FieldValue
        label={tr("common.orderLinesAllocated")}
        value={
          wo.orderLines.length > 0 ? (
            <Stack gap={2}>
              {wo.orderLines.map((l) => (
                <Group gap={6} key={l.orderLineId} wrap="nowrap">
                  <Anchor
                    component={Link}
                    href={`${SALES_ORDERS_PATH}/${l.number}`}
                    size="sm"
                  >
                    <DocNumber c="blue">{l.number}</DocNumber>
                  </Anchor>
                  <Text c="dimmed" size="xs">
                    割当 {l.allocatedQuantity} / 受注 {l.lineQuantity}
                  </Text>
                </Group>
              ))}
            </Stack>
          ) : (
            <Badge color="teal" size="sm" variant="light">
              {tr("common.forStockNoOrderLine")}
            </Badge>
          )
        }
      />
      <FieldValue
        label={tr("common.customer")}
        value={
          wo.orderLines.length > 0
            ? [
                ...new Set(
                  wo.orderLines
                    .map((l) => l.customerName)
                    .filter((n): n is string => !!n),
                ),
              ].join(" / ") || "—"
            : "—"
        }
      />
      <FieldValue label={tr("common.createdBy")} value={wo.createdByName} />
      <FieldValue label="製品" value={wo.productName} />
      <FieldValue
        label={tr("common.type2")}
        value={workOrderTypeLabel(wo.type, locale) ?? wo.type}
      />
      <FieldValue
        label={tr("common.plannedQuantity")}
        value={`${wo.plannedQuantity}`}
      />
      <FieldValue
        label={tr("production.workOrders.materialUsed")}
        value={
          wo.materialCode ? `${wo.materialCode}（${wo.materialName}）` : null
        }
      />
      <FieldValue
        label={tr("common.lotNumber")}
        value={<DocNumber>{wo.lotNumber ?? wo.workOrderNumber}</DocNumber>}
      />
      <FieldValue
        label={tr("common.storageLocations")}
        value={wo.storageLocationName}
      />
      <FieldValue
        label={tr("production.workOrders.processRoute")}
        value={
          wo.routeName != null ? (
            <Anchor
              component={Link}
              href={`/master/products/${wo.productId}?tab=routes`}
              size="sm"
            >
              {wo.routeName} v{wo.routeVersion}
            </Anchor>
          ) : null
        }
      />
      <FieldValue
        label={tr("production.workOrders.copiedFrom")}
        value={
          wo.sourceWorkOrderNumber != null ? (
            <Anchor
              component={Link}
              href={`${BASE_PATH}/${wo.sourceWorkOrderNumber}`}
              size="sm"
            >
              <DocNumber c="blue">
                {wo.sourceWorkOrderDocNumber ?? `#${wo.sourceWorkOrderNumber}`}
              </DocNumber>
            </Anchor>
          ) : null
        }
      />
      <FieldValue
        label={tr("common.inspectionSheet")}
        value={(() => {
          // 工程単位の割当を検査工程ごとに要約（工程名: 検査表 / …）
          const rows = wo.steps
            .filter((s) => s.inspectionTemplates.length > 0)
            .map(
              (s) =>
                `${s.name}: ${s.inspectionTemplates.map((t) => t.name).join("・")}`,
            );
          return rows.length > 0 ? rows.join(" / ") : null;
        })()}
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
                label: tr("common.copy2"),
                icon: <IconCopy size={14} />,
                onClick: () => setCopyOpen(true),
              },
              {
                // 帯（最小要約 + QR）を別タブで開いてブラウザ印刷する。
                // QR は CKK:WO:<番号> — 将来キオスクで読んで工程へ飛ぶ。
                label: tr("production.workOrders.printStrips"),
                icon: <IconPrinter size={14} />,
                href: `${BASE_PATH}/print?ids=${wo.workOrderNumber}`,
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
              tr("common.production"),
              { label: tr("common.approvalsSchedule"), href: "/general/tasks" },
              woLabel,
            ]
          : [
              tr("common.production"),
              { label: tr("common.workOrder"), href: BASE_PATH },
              woLabel,
            ]
      }
      createdAt={fmt.dateTime(wo.createdAt)}
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
      title={isApproval ? `承認 ${woLabel}` : `指示書 ${woLabel}`}
      updatedAt={fmt.dateTime(wo.updatedAt)}
    >
      {/* 「いまやること」カードは常に最上部。承認画面は承認状況もサマリより上 */}
      {approvalCard}
      {/* 事後承認（POST）で差し戻されたが適用済みの変更 — 人が直すまで出続ける */}
      {rejectedAppliedFlowChange && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          title={tr("production.workOrders.aSentBackWorkflowChangeIs")}
          variant="light"
        >
          <Stack align="flex-start" gap="xs">
            <Text size="sm">
              {rejectedAppliedFlowChange.summary}
              は即時適用の後に差し戻されましたが、工程は自動では元に戻りません。
              工程を確認して必要なら手で直し、「確認済みにする」を押してください。
            </Text>
            <Button
              color="red"
              loading={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await acknowledgeFlowChangeAction(
                    rejectedAppliedFlowChange.id,
                    wo.workOrderNumber,
                  );
                  if (result.ok) {
                    notifications.show({
                      title: tr("production.workOrders.markedAsChecked"),
                      message: "",
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
                })
              }
              size="xs"
              variant="light"
            >
              {tr("production.workOrders.markAsChecked")}
            </Button>
          </Stack>
        </Alert>
      )}
      {/* 承認依頼中の工程フロー変更（承認設定が未設定なら出ない = 即適用） */}
      {flowChange && flowChangeApproval && (
        <FlowChangeCard approval={flowChangeApproval} change={flowChange} />
      )}
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

      <AppTabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="drawing">{tr("common.drawing2")}</Tabs.Tab>
          <Tabs.Tab value="related">{tr("common.related")}</Tabs.Tab>
          <Tabs.Tab value="memo">{tr("common.memo")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {!isApproval && (
              <WorkOrderLinksCard
                incoming={wo.woLinksIncoming}
                outgoing={wo.woLinksOutgoing}
                status={wo.status}
                workOrderNumber={wo.workOrderNumber}
              />
            )}
            <WorkOrderStepsPanel
              catalogOptions={catalogOptions}
              stepLinks={wo.stepLinks}
              steps={wo.steps}
              workOrderNumber={wo.workOrderNumber}
              workOrderStatus={wo.status}
            />
            <WorkOrderFinalInspectionPanel
              finalInspection={wo.finalInspection}
              workOrderNumber={wo.workOrderNumber}
            />
            {wo.notes && (
              <div>
                <Text c="dimmed" mb={4} size="xs">
                  {tr("common.notes")}
                </Text>
                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                  {wo.notes}
                </Text>
              </div>
            )}
          </Stack>
        </Tabs.Panel>

        {/* 図面 — 現場が「何を見て作るか」。製品の最新の主図面 1 枚だけを
            サムネイルで置き、押すと拡大する。工程や在庫を見に来ただけの人に
            毎回モデルを読み込ませないよう、常設のビューアにはしない。 */}
        <Tabs.Panel pt="md" value="drawing">
          {designFile ? (
            <Stack gap="sm">
              {/* 固定しているか、そのつど最新を引いているか。現場が見ている
                  図面が「改訂で変わりうるもの」かどうかは、ここでしか判らない。 */}
              <Group gap="xs" wrap="wrap">
                <Badge color={designPinned ? "violet" : "gray"} variant="light">
                  {designPinned
                    ? "この版に固定"
                    : tr("production.workOrders.showTheLatest")}
                </Badge>
                {designFile.customerName ? (
                  <Badge color="blue" variant="light">
                    {designFile.customerName}
                  </Badge>
                ) : (
                  <Badge color="gray" variant="outline">
                    {tr("common.generic")}
                  </Badge>
                )}
                {onToggleDesignPin && (
                  <GhostButton
                    onClick={() =>
                      onToggleDesignPin(designPinned ? null : designFile.id)
                    }
                  >
                    {designPinned
                      ? "固定を解除"
                      : tr("production.workOrders.pinToThisVersion")}
                  </GhostButton>
                )}
              </Group>
              <Box maw={360}>
                <DesignFileThumb
                  target={{
                    caption: `v${designFile.version}${designPinned ? "" : "（最新）"}`,
                    filename: designFile.filename,
                    mimeType: designFile.mimeType,
                    src: `/api/design-files/${encodeURIComponent(designFile.id)}`,
                  }}
                />
              </Box>
              {/* wrap="wrap" — 長いファイル名 + 依頼番号は 375px で 1 行に
                  収まらない。nowrap のままだと依頼番号が枠外へ出る。 */}
              <Group gap="sm" wrap="wrap">
                <Text size="sm" style={{ overflowWrap: "anywhere" }}>
                  {designFile.filename}
                </Text>
                {designFile.requestNumber && (
                  <Anchor
                    onClick={() =>
                      router.push(
                        `/sales/design-requests/${encodeURIComponent(designFile.requestNumber ?? "")}`,
                      )
                    }
                    size="sm"
                  >
                    {designFile.requestNumber}
                  </Anchor>
                )}
              </Group>
            </Stack>
          ) : (
            <EmptyState
              icon={<IconRuler2 size={24} />}
              message={tr("production.workOrders.noDrawingIsRegisteredForThis")}
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.orderLine")}
              </Text>
              {wo.orderLines.length > 0 ? (
                <Stack gap={4}>
                  {wo.orderLines.map((l) => (
                    <Group gap={6} key={l.orderLineId} wrap="nowrap">
                      <Anchor
                        component={Link}
                        href={`${SALES_ORDERS_PATH}/${l.number}`}
                        size="sm"
                      >
                        <DocNumber c="blue">{l.number}</DocNumber>
                      </Anchor>
                      <Text c="dimmed" size="xs">
                        割当 {l.allocatedQuantity} / 受注 {l.lineQuantity}
                        {l.customerName ? ` / ${l.customerName}` : ""}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              ) : (
                <Text c="dimmed" size="sm">
                  {tr("production.workOrders.standaloneWorkOrderForStockNo")}
                </Text>
              )}
            </div>
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("production.workOrders.copyCreateFromThisWorkOrder")}
              </Text>
              {wo.copies.length > 0 ? (
                <Stack gap={4}>
                  {wo.copies.map((c) => (
                    <Anchor
                      component={Link}
                      href={`${BASE_PATH}/${c.docNumber}`}
                      key={c.workOrderNumber}
                      size="sm"
                    >
                      <DocNumber c="blue">
                        {c.docNumber}（{fmt.dateTime(c.createdAt)}）
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
                  {tr("production.workOrders.copiedFrom")}
                </Text>
                <Anchor
                  component={Link}
                  href={`${BASE_PATH}/${wo.sourceWorkOrderDocNumber ?? wo.sourceWorkOrderNumber}`}
                  size="sm"
                >
                  <DocNumber c="blue">
                    {wo.sourceWorkOrderDocNumber ??
                      `#${wo.sourceWorkOrderNumber}`}
                  </DocNumber>
                </Anchor>
              </div>
            )}
          </Stack>
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="memo">
          <MemoPanel
            memos={memos}
            mode="memo"
            ownerId={String(wo.workOrderNumber)}
            ownerType="work_orders"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ModalShell
        confirmLabel={tr("production.workOrders.createACopy")}
        loading={isPending}
        onClose={() => setCopyOpen(false)}
        onConfirm={handleCopy}
        opened={copyOpen}
        size="md"
        title={`指示書 ${woLabel} をコピー`}
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
            initialOption={
              wo.orderLines.length > 0
                ? {
                    value: wo.orderLines[0].orderLineId,
                    label: `${wo.orderLines[0].number} ${wo.productName}（${wo.orderLines[0].lineQuantity}）`,
                  }
                : null
            }
            label={tr("production.workOrders.orderLinesCovered")}
            onChange={setCopyTargetSoId}
            onSearch={searchAllocatableOrderLineOptions}
            placeholder={tr(
              "production.workOrders.nothingSelectedCopiedAsForStock",
            )}
            storageKey="sales-order"
            value={copyTargetSoId}
          />
          <Text c="dimmed" size="xs">
            {tr("production.workOrders.createsADraftCarryingOverThe")}
          </Text>
        </Stack>
      </ModalShell>
    </DetailShell>
  );
}
