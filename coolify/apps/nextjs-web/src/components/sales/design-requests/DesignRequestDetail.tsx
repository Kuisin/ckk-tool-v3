"use client";

/**
 * DesignRequestDetail — 設計依頼書 詳細 (SA26, design.md §8.2).
 *
 * 最上部の ActionCard（いまやること — 権限で色が変わる）+ SummaryGrid +
 * 承認・作業状況パネル（線形 Stepper 依頼→承認→着手→完了）+ Tabs
 * （概要 / ファイル / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT / REJECTED: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認 / 差し戻し（理由必須 → REJECTED）— 段数は承認設定 MS0B
 *   PENDING: 着手 / 担当者変更 / 製品の紐付け / キャンセル
 *   IN_PROGRESS: 完了（要添付）/ 担当者変更 / 製品の紐付け / キャンセル
 *   COMPLETED: 差し戻し（作業の巻き戻し。承認は取りなおさない）
 *
 * 承認軸の「差し戻し」(REJECTED) と作業軸の「差し戻し」(COMPLETED →
 * IN_PROGRESS) は別物。前者は ApprovalActionCard、後者は「…」メニュー。
 *
 * PDF タブは承認済み以降のみ（isIssuedDesign）— 承認前の内容は紙にしない。
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
  Tabs,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconFile,
  IconPlayerPlay,
  IconUserCog,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import {
  approveDesign,
  cancelDesign,
  completeDesign,
  rejectDesign,
  reopenDesign,
  requestDesignApproval,
  setDesignAssignee,
  startDesign,
} from "@/app/(dashboard)/sales/design-requests/actions";
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
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import {
  PdfAttachmentPanel,
  type PdfFileMeta,
} from "@/components/ui/PdfAttachmentPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import {
  DESIGN_KIND_LABEL,
  DESIGN_PRIORITY_LABEL,
  DESIGN_TRIGGER_LABEL,
} from "@/lib/enum-labels";
import type { ActionResult } from "@/lib/server-action";
import { CompleteDesignModal } from "./CompleteDesignModal";
import { DesignFileList } from "./DesignFileList";
import {
  canAttachFiles,
  canComplete,
  canReassign,
  canReopen,
  canRequestApproval,
  canStart,
  DESIGN_HISTORY_ACTION_LABEL,
  DESIGN_KIND_COLOR,
  DESIGN_TRIGGER_COLOR,
  type DesignRequest,
  hasSourceDocument,
  isCancellable,
  isEditable,
  isIssuedDesign,
} from "./model";

const BASE_PATH = "/sales/design-requests";

interface Option {
  value: string;
  label: string;
}

/** status → Stepper の active index（依頼 / 承認 / 着手 / 完了）。 */
function stepperActive(status: DesignRequest["status"]): number {
  switch (status) {
    case "DRAFT":
    case "REJECTED":
      return 0;
    case "REQUESTED":
      return 1;
    case "PENDING":
      return 2;
    case "IN_PROGRESS":
      return 3;
    case "COMPLETED":
      return 4;
    default:
      return -1; // CANCELLED
  }
}

/**
 * Stepper に出す「承認」段の説明。段数は承認設定 (MS0B) が決めるので、
 * 進行中は「2/3 部門承認」、それ以外は担当グループ名を出す。
 */
function approvalStepDescription(approval: ApprovalActionState): string {
  if (approval.phase === "PENDING" && approval.stepCount > 1) {
    return `${approval.stepNo}/${approval.stepCount} ${approval.stepLabel}`;
  }
  return approval.groupLabel || "承認グループ";
}

export function DesignRequestDetail({
  request,
  auditEntries,
  attachments,
  approval,
  approvalTrail = [],
  assigneeOptions = [],
  pdfMeta = null,
}: {
  request: DesignRequest;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 設計ファイル添付（design_requests ownerType）。 */
  attachments: AttachmentView[];
  /** 承認の現況（ApprovalActionCard / Stepper 用）。 */
  approval: ApprovalActionState;
  /** 承認記録（代理を含む正規化済みの記録）。 */
  approvalTrail?: ApprovalTrailView[];
  /** 担当者候補（有効な従業員）。 */
  assigneeOptions?: Option[];
  /** 保管済み PDF のメタ（承認前は null）。 */
  pdfMeta?: PdfFileMeta | null;
}) {
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("overview");
  const [isPending, startTransition] = useTransition();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [assigneeDraft, setAssigneeDraft] = useState(request.assigneeId ?? "");
  const [pdfFile, setPdfFile] = useState<PdfFileMeta | null>(pdfMeta);
  const [pdfNonce, setPdfNonce] = useState(0);

  const canViewPdf = isIssuedDesign(request.status);
  const pdfFilename = `${request.requestNumber}.pdf`;
  const pdfUrl = (extra = "") =>
    `/api/pdf/design-request?id=${encodeURIComponent(request.requestNumber)}${extra}`;

  const regeneratePdf = async () => {
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
        title: "再生成しました",
        message: "PDF を再生成・保存しました",
        color: "green",
      });
    } catch (e) {
      notifications.show({
        title: "エラー",
        message: e instanceof Error ? e.message : "PDF の再生成に失敗しました",
        color: "red",
      });
    }
  };

  /**
   * モーダルを開くときは現在値から下書きを作り直す。useState の初期値は初回
   * レンダリングでしか効かないので、router.refresh() 後に開くと前の値が残る。
   */
  const openAssignee = () => {
    setAssigneeDraft(request.assigneeId ?? "");
    setAssigneeOpen(true);
  };
  const closeAll = () => {
    setCompleteOpen(false);
    setReopenOpen(false);
    setCancelOpen(false);
    setAssigneeOpen(false);
  };

  /** 状態遷移アクションの共通実行（成功トースト + refresh）。 */
  const run = (action: () => Promise<ActionResult>, successMessage: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: successMessage,
          message: `設計依頼書 ${request.requestNumber}`,
          color: "green",
        });
        closeAll();
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

  // 遷移履歴は新しい順で表示
  const records = [...request.history].reverse();
  // 差し戻し中の表示用: 最新の REJECT エントリの理由
  const lastReject = records.find((h) => h.action === "REJECT");

  /**
   * 「いまやること」カード（最上部）。承認待ちは承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認待ち」表示。
   */
  let actionCard: ReactNode = null;
  if (canRequestApproval(request) || request.status === "REQUESTED") {
    actionCard = (
      <ApprovalActionCard
        approval={approval}
        canRequest={canRequestApproval(request)}
        onApprove={() => approveDesign(request.requestNumber)}
        onReject={(reason) => rejectDesign(request.requestNumber, reason)}
        onRequest={() => requestDesignApproval(request.requestNumber)}
        rejectReason={lastReject?.notes ?? null}
        subject={`設計依頼書 ${request.requestNumber}`}
      />
    );
  } else if (canStart(request)) {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconPlayerPlay size={14} />}
            loading={isPending}
            onClick={() =>
              run(() => startDesign(request.requestNumber), "着手しました")
            }
          >
            着手
          </PrimaryButton>
        }
        description={`承認済みです。${request.assigneeName ?? "担当者"} が図面の作成を始められます`}
        icon={<IconPlayerPlay size={20} />}
        title="着手できます"
        tone="action"
      />
    );
  } else if (canComplete(request)) {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconCheck size={14} />}
            loading={isPending}
            onClick={() => setCompleteOpen(true)}
          >
            完了
          </PrimaryButton>
        }
        description={
          attachments.length === 0
            ? "完了するとファイルを選んで版として登録します（この場で追加もできます）"
            : `添付 ${attachments.length} 件から主図面を選んで、ひとつの版として登録します`
        }
        icon={<IconCheck size={20} />}
        title="図面ができたら完了できます"
        tone={attachments.length === 0 ? "wait" : "action"}
      />
    );
  }

  const reassignable = canReassign(request);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...(canComplete(request)
              ? [
                  {
                    label: "完了",
                    icon: <IconCheck size={14} />,
                    onClick: () => setCompleteOpen(true),
                  },
                ]
              : []),
            ...(reassignable
              ? [
                  {
                    label: "担当者を変更",
                    icon: <IconUserCog size={14} />,
                    onClick: openAssignee,
                  },
                ]
              : []),
            ...(canReopen(request)
              ? [
                  {
                    label: "差し戻し（作業）",
                    icon: <IconArrowBackUp size={14} />,
                    color: "red",
                    onClick: () => setReopenOpen(true),
                  },
                ]
              : []),
            ...(isCancellable(request)
              ? [
                  {
                    label: "キャンセル",
                    icon: <IconX size={14} />,
                    color: "red",
                    onClick: () => setCancelOpen(true),
                  },
                ]
              : []),
          ]}
          onEdit={
            isEditable(request)
              ? () => router.push(`${BASE_PATH}/${request.requestNumber}/edit`)
              : undefined
          }
          pdf={canViewPdf ? { href: pdfUrl() } : undefined}
        />
      }
      breadcrumbs={["販売", { label: "設計依頼書", href: BASE_PATH }, "詳細"]}
      createdAt={fmt.dateTime(request.createdAt)}
      status={<StatusBadge entity="DesignRequest" status={request.status} />}
      title={request.requestNumber}
      updatedAt={fmt.dateTime(request.updatedAt)}
    >
      {actionCard}

      <SummaryGrid>
        <FieldValue
          label="依頼番号"
          value={<DocNumber>{request.requestNumber}</DocNumber>}
        />
        <FieldValue
          label="トリガー"
          value={
            <Badge
              color={DESIGN_TRIGGER_COLOR[request.trigger] ?? "gray"}
              variant="light"
            >
              {DESIGN_TRIGGER_LABEL[request.trigger] ?? request.trigger}
            </Badge>
          }
        />
        {!hasSourceDocument(request.trigger) ? (
          // 単独 — 紐づく書類が無いことを「—」ではなく明示する
          // （空欄だと「入れ忘れ」に見えて、後から探しに行かれる）。
          <FieldValue
            label="参照元"
            value={
              <Text c="dimmed" size="sm">
                なし（単独起票）
              </Text>
            }
          />
        ) : request.trigger === "QUOTE" ? (
          <FieldValue
            label="見積書"
            value={
              request.quoteNumber ? (
                <Anchor
                  onClick={() =>
                    router.push(`/sales/quotes/${request.quoteNumber}`)
                  }
                  size="sm"
                >
                  <DocNumber c="blue">{request.quoteNumber}</DocNumber>
                </Anchor>
              ) : (
                "—"
              )
            }
          />
        ) : (
          <FieldValue
            label="注文明細"
            value={
              request.orderLineNumber ? (
                <Anchor
                  onClick={() =>
                    router.push(`/sales/order-lines/${request.orderLineNumber}`)
                  }
                  size="sm"
                >
                  <DocNumber c="blue">{request.orderLineNumber}</DocNumber>
                </Anchor>
              ) : (
                "—"
              )
            }
          />
        )}
        <FieldValue label="製品" value={request.productName ?? "—"} />
        {/* 完成した版がどの系列に載るか。汎用なら全顧客の指示書から見える。 */}
        <FieldValue
          label="受注元"
          value={
            request.customerName ? (
              <Badge color="blue" variant="light">
                {request.customerName}
              </Badge>
            ) : (
              <Badge color="gray" variant="outline">
                汎用
              </Badge>
            )
          }
        />
        <FieldValue
          label="依頼区分"
          value={
            <Group gap="xs" wrap="nowrap">
              <Badge
                color={DESIGN_KIND_COLOR[request.kind] ?? "gray"}
                variant="light"
              >
                {DESIGN_KIND_LABEL[request.kind] ?? request.kind}
              </Badge>
              {request.kindOverridden && (
                <Text c="dimmed" size="xs">
                  手動指定
                </Text>
              )}
            </Group>
          }
        />
        <FieldValue label="担当者" value={request.assigneeName ?? "—"} />
        <FieldValue
          label="希望納期"
          value={request.desiredAt ? fmt.date(request.desiredAt) : "—"}
        />
        <FieldValue
          label="優先度"
          value={
            request.priority === "HIGH" ? (
              <Badge color="red" variant="light">
                急ぎ
              </Badge>
            ) : (
              (DESIGN_PRIORITY_LABEL[request.priority] ?? request.priority)
            )
          }
        />
        <FieldValue label="作成者" value={request.createdByName ?? "—"} />
        <FieldValue
          label="依頼日時"
          value={request.requestedAt ? fmt.dateTime(request.requestedAt) : "—"}
        />
        <FieldValue
          label="承認日時"
          value={request.approvedAt ? fmt.dateTime(request.approvedAt) : "—"}
        />
        <FieldValue
          label="完了日"
          value={request.completedAt ? fmt.dateTime(request.completedAt) : "—"}
        />
      </SummaryGrid>

      {/* 承認・作業状況 — 購買依頼の承認パネルと同型（線形 4 段階） */}
      <Paper p="md" radius="md" withBorder>
        <Title mb="md" order={5}>
          承認・作業状況
        </Title>

        <Stepper active={stepperActive(request.status)} size="sm">
          <Stepper.Step
            description={
              request.requestedAt ? fmt.date(request.requestedAt) : "作成中"
            }
            label="依頼"
            loading={
              request.status === "DRAFT" || request.status === "REJECTED"
            }
          />
          <Stepper.Step
            description={
              request.approvedAt
                ? fmt.date(request.approvedAt)
                : approvalStepDescription(approval)
            }
            label="承認"
            loading={request.status === "REQUESTED"}
          />
          <Stepper.Step
            description={
              request.startedAt
                ? fmt.date(request.startedAt)
                : (request.assigneeName ?? "担当者")
            }
            label="着手"
            loading={request.status === "PENDING"}
          />
          <Stepper.Step
            description={
              request.completedAt ? fmt.date(request.completedAt) : "図面の添付"
            }
            label="完了"
            loading={request.status === "IN_PROGRESS"}
          />
        </Stepper>

        {request.status === "CANCELLED" && (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            mt="md"
            title="キャンセル済"
            variant="light"
          >
            {request.cancelReason ?? "—"}
          </Alert>
        )}

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
                    {DESIGN_HISTORY_ACTION_LABEL[h.action] ?? h.action}
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
      </Paper>

      <Tabs onChange={setTab} value={tab}>
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="files">ファイル（{request.files.length}）</Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {/* 改訂は「何を基に描くか」が先。設計者が最初に見る情報。 */}
            {request.kind === "REVISION" && (
              <Alert color="orange" title="改訂" variant="light">
                <Stack gap={4}>
                  <Text size="sm">
                    元図面:{" "}
                    {request.baseDesignFileId ? (
                      <Anchor
                        href={`/api/design-files/${encodeURIComponent(request.baseDesignFileId)}`}
                        size="sm"
                        target="_blank"
                      >
                        {request.baseDesignFileLabel ?? "版を開く"}
                      </Anchor>
                    ) : (
                      "—"
                    )}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    変更理由: {request.changeReason || "—"}
                  </Text>
                </Stack>
              </Alert>
            )}
            <div>
              <Text c="dimmed" mb={4} size="xs">
                依頼内容
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {request.description || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* 設計ファイル — 添付（作業ファイル）+ 完了時に版管理へ登録される。 */}
        <Tabs.Panel pt="md" value="files">
          <Stack gap="md">
            <AttachmentsPanel
              attachments={attachments}
              canDelete={canAttachFiles(request)}
              canUpload={canAttachFiles(request)}
              ownerId={request.requestNumber}
              ownerType="design_requests"
              title="設計ファイル（完了時に最新版として登録されます）"
            />
            {request.files.length === 0 ? (
              <EmptyState
                icon={<IconFile size={24} />}
                message="登録済みバージョンはありません"
              />
            ) : (
              <DesignFileList rows={request.files} />
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="pdf">
          <PdfAttachmentPanel
            downloadHref={pdfUrl("&download=1")}
            emptyMessage="承認されると設計依頼書の PDF を閲覧できます。"
            file={pdfFile}
            filename={pdfFilename}
            onRegenerate={regeneratePdf}
            previewSrc={canViewPdf ? pdfUrl(`&v=${pdfNonce}`) : undefined}
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <CompleteDesignModal
        attachments={attachments}
        loading={isPending}
        onClose={() => setCompleteOpen(false)}
        onConfirm={(input) =>
          run(
            () => completeDesign(request.requestNumber, input),
            "完了しました",
          )
        }
        opened={completeOpen}
        ownerType="design_requests"
        requestNumber={request.requestNumber}
      />
      <ConfirmModal
        confirmLabel="差し戻す"
        loading={isPending}
        message={`設計依頼書 ${request.requestNumber} を進行中へ差し戻します。完了日時はクリアされますが、承認は取りなおしになりません。`}
        onClose={() => setReopenOpen(false)}
        onConfirm={() =>
          run(() => reopenDesign(request.requestNumber), "差し戻しました")
        }
        opened={reopenOpen}
        title="差し戻しの確認"
      />

      <ModalShell
        confirmColor="red"
        confirmLabel="キャンセルする"
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(
            () => cancelDesign(request.requestNumber, cancelReason),
            "キャンセルしました",
          )
        }
        opened={cancelOpen}
        title="設計依頼のキャンセル"
      >
        <Stack gap="sm">
          <Text size="sm">
            設計依頼書 {request.requestNumber} をキャンセルします。承認依頼中の
            場合は承認待ちの一覧からも取り下げられます。
          </Text>
          <Textarea
            autosize
            label="キャンセル理由"
            minRows={3}
            onChange={(e) => setCancelReason(e.currentTarget.value)}
            placeholder="なぜキャンセルするか"
            value={cancelReason}
            withAsterisk
          />
        </Stack>
      </ModalShell>

      <ModalShell
        confirmLabel="変更する"
        loading={isPending}
        onClose={() => setAssigneeOpen(false)}
        onConfirm={() =>
          run(
            () => setDesignAssignee(request.requestNumber, assigneeDraft),
            "担当者を変更しました",
          )
        }
        opened={assigneeOpen}
        title="担当者の変更"
      >
        <Select
          data={assigneeOptions}
          description="変更すると、新しい担当者に通知が届きます"
          label="担当者"
          onChange={(v) => setAssigneeDraft(v ?? "")}
          placeholder="図面をつくる担当者"
          searchable
          value={assigneeDraft || null}
          withAsterisk
        />
      </ModalShell>
    </DetailShell>
  );
}
