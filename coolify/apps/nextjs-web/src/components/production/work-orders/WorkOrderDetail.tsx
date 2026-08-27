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
 * 新しい版があれば警告）/ キャンセル（DRAFT・承認待ちのみ）。
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
import { useState, useTransition } from "react";
import { searchAllocatableOrderLineOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  acknowledgeFlowChangeAction,
  cancelWorkOrder,
  copyWorkOrder,
} from "@/app/(dashboard)/production/work-orders/actions";
import type { ApprovalActionState } from "@/components/approvals/ApprovalActionCard";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  type ApprovalTrailView,
  WorkOrderApprovalCard,
  WorkOrderProcedurePanel,
} from "@/components/production/ApprovalStatusPanel";
import { WorkOrderStepsPanel } from "@/components/production/WorkOrderStepsPanel";
import type { ProductDesignFile } from "@/components/sales/design-requests/model";
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
import { WORK_ORDER_TYPE_LABEL } from "@/lib/enum-labels";
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
  /** 承認待ちの工程フロー変更（承認設定が未設定なら常に null = 即適用）。 */
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

  const handleCopy = () => {
    startTransition(async () => {
      const result = await copyWorkOrder(
        wo.workOrderNumber,
        copyTargetSoId ?? "",
      );
      if (result.ok) {
        notifications.show({
          title: "コピーしました",
          message: `指示書 ${result.data.docNumber} を作成しました`,
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
      message: `指示書 ${woLabel} をキャンセルします。この操作は取り消せません。`,
      confirmLabel: "キャンセルする",
      onConfirm: () => {
        startTransition(async () => {
          const result = await cancelWorkOrder(wo.workOrderNumber);
          if (result.ok) {
            notifications.show({
              title: "キャンセルしました",
              message: `指示書 ${woLabel}`,
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
        label="注文明細（割当）"
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
              在庫向け（注文明細なし）
            </Badge>
          )
        }
      />
      <FieldValue
        label="顧客"
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
      <FieldValue label="作成者" value={wo.createdByName} />
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
      <FieldValue label="保管場所" value={wo.storageLocationName} />
      <FieldValue
        label="工程ルート"
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
        label="コピー元"
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
        label="検査表"
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
                label: "コピー",
                icon: <IconCopy size={14} />,
                onClick: () => setCopyOpen(true),
              },
              {
                // 帯（最小要約 + QR）を別タブで開いてブラウザ印刷する。
                // QR は CKK:WO:<番号> — 将来キオスクで読んで工程へ飛ぶ。
                label: "ストリップ印刷",
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
          ? ["生産", { label: "承認・予定", href: "/general/tasks" }, woLabel]
          : ["生産", { label: "指示書", href: BASE_PATH }, woLabel]
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
          title="差し戻された工程フロー変更が適用されたままです"
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
                      title: "確認済みにしました",
                      message: "",
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
                })
              }
              size="xs"
              variant="light"
            >
              確認済みにする
            </Button>
          </Stack>
        </Alert>
      )}
      {/* 承認待ちの工程フロー変更（承認設定が未設定なら出ない = 即適用） */}
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

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="drawing">図面</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="memo">メモ</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
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

        {/* 図面 — 現場が「何を見て作るか」。製品の最新の主図面 1 枚だけを
            サムネイルで置き、押すと拡大する。工程や在庫を見に来ただけの人に
            毎回モデルを読み込ませないよう、常設のビューアにはしない。 */}
        <Tabs.Panel pt="md" value="drawing">
          {designFile ? (
            <Stack gap="sm">
              <Box maw={360}>
                <DesignFileThumb
                  target={{
                    caption: `v${designFile.version}（最新）`,
                    filename: designFile.filename,
                    mimeType: designFile.mimeType,
                    src: `/api/design-files/${encodeURIComponent(designFile.id)}`,
                  }}
                />
              </Box>
              <Group gap="sm" wrap="nowrap">
                <Text size="sm">{designFile.filename}</Text>
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
              message="この製品の図面はまだ登録されていません"
            />
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="related">
          <Stack gap="md">
            <div>
              <Text c="dimmed" mb={4} size="xs">
                注文明細
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
                  在庫向けの独立指示書（注文明細なし）
                </Text>
              )}
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
                  コピー元
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
      </Tabs>

      <ModalShell
        confirmLabel="コピー作成"
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
            label="対象注文明細"
            onChange={setCopyTargetSoId}
            onSearch={searchAllocatableOrderLineOptions}
            placeholder="未選択 = 在庫向け（注文明細なし）としてコピー"
            storageKey="sales-order"
            value={copyTargetSoId}
          />
          <Text c="dimmed" size="xs">
            工程・実施場所・検査表を引き継いだ下書きを作成します。
            注文明細を選ばない場合は在庫向けの独立指示書としてコピーします
            （在庫分の指示書は注文明細が必要です）。
          </Text>
        </Stack>
      </ModalShell>
    </DetailShell>
  );
}
