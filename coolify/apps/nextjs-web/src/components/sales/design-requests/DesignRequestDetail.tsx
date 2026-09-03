"use client";

/**
 * DesignRequestDetail — 設計依頼書 詳細 (SA26, design.md §8.2).
 *
 * 最上部の ActionCard（いまやること — 権限で色が変わる）+ SummaryGrid +
 * 手続き状況（ProcedurePanel — 依頼→承認→着手→完了、見積書・注文明細 ← /
 * 図面 →）+ Tabs（概要 / ファイル / 履歴）。
 *
 * 状態別アクション:
 *   DRAFT / REJECTED: 承認依頼 + 編集 / キャンセル
 *   REQUESTED: 承認 / 差し戻し（理由必須 → REJECTED）— 段数は承認設定 MS0B
 *   PENDING: 着手 / 担当者変更 / 製品の紐付け / キャンセル
 *   IN_PROGRESS: 完了（要・設計図の版）/ 担当者変更 / 製品の紐付け / キャンセル
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
  Box,
  Divider,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconCheck,
  IconFile,
  IconPlayerPlay,
  IconUserCog,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { DesignFileList } from "@/components/production/design-files/DesignFileList";
import { ActionCard } from "@/components/ui/ActionCard";
import { AppTabs } from "@/components/ui/AppTabs";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import {
  PdfAttachmentPanel,
  type PdfFileMeta,
} from "@/components/ui/PdfAttachmentPanel";
import {
  approvalStage,
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
import { isViewable } from "@/lib/design-file-kind";
import { pickThumbFile } from "@/lib/design-files-core";
import type { MemoView } from "@/lib/document-memos";
import {
  designHistoryActionLabel,
  designKindLabel,
  designPriorityLabel,
  designTriggerLabel,
} from "@/lib/enum-labels";
import type { ActionResult } from "@/lib/server-action";
import {
  canAttachFiles,
  canComplete,
  canReassign,
  canReopen,
  canRequestApproval,
  canStart,
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

export function DesignRequestDetail({
  request,
  auditEntries,
  attachments,
  approval,
  approvalTrail = [],
  assigneeOptions = [],
  pdfMeta = null,
  memos = [],
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
  /** コメント（document_memos, ownerType "design_requests"）。 */
  memos?: MemoView[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
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

  /**
   * サムネイルに出す 1 枚。
   *
   * 登録済みの版があればそれ（製品マスタと同じ規則 — 最新版の
   * プレビュー → 図面データ）。まだ無ければ、添付の中で表示できる
   * いちばん新しいものを出す。完了前は版が存在しないので、後者が無いと
   * 図面を描いている期間ずっと何も見えない。
   *
   * 版と添付では**配信ルートが違う**（版は design_files → files を直接
   * 指していて document_attachments の行ではない）ので、URL もそれぞれ。
   */
  const thumbTarget = (() => {
    const version = pickThumbFile(request.files);
    if (version) {
      return {
        caption: version.isLatest
          ? tr("sales.designRequestDetail.versionCaptionLatest", {
              version: version.version,
              filename: version.filename,
            })
          : tr("sales.designRequestDetail.versionCaption", {
              version: version.version,
              filename: version.filename,
            }),
        filename: version.filename,
        mimeType: version.mimeType,
        src: `/api/design-files/${encodeURIComponent(version.id)}`,
      };
    }
    // listAttachments は新しい順。表示できないもの（CAD 等）は飛ばす。
    const a = attachments.find((x) => isViewable(x.filename, x.mimeType));
    return a
      ? {
          caption: tr(
            "sales.designRequestDetail.unregisteredAttachmentCaption",
            { filename: a.filename },
          ),
          filename: a.filename,
          mimeType: a.mimeType,
          src: `/api/attachments/${encodeURIComponent(a.id)}`,
        }
      : null;
  })();

  // 成果物（この依頼から出来た版）。完了できるかの判定はサーバー側
  // (completeDesign) が正で、ここは同じ条件を画面に出しているだけ。
  const producedVersions = [
    ...new Set(request.files.map((f) => f.version)),
  ].sort((a, b) => b - a);
  const hasProducedVersion = producedVersions.length > 0;
  /** 未登録のときに送る先 — 製品・受注元・依頼を埋めた 設計図 の登録画面。 */
  const registerDrawingHref = `/production/design-files/new?request=${encodeURIComponent(
    request.requestNumber,
  )}`;

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
        title: tr("common.regenerated"),
        message: tr("common.pDFRegeneratedAndSaved"),
        color: "green",
      });
    } catch (e) {
      notifications.show({
        title: tr("common.error2"),
        message:
          e instanceof Error
            ? e.message
            : tr("common.couldNotRegenerateThePdf"),
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
          message: tr("sales.designRequestDetail.designRequestWithNumber", {
            number: request.requestNumber,
          }),
          color: "green",
        });
        closeAll();
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

  // 遷移履歴は新しい順で表示
  const records = [...request.history].reverse();

  // ── 手続き状況（依頼 → 承認 → 着手 → 完了）───────────────────────────────
  const stages: ProcedureStage[] = [
    {
      key: "requested",
      label: tr("common.request"),
      description: request.requestedAt
        ? fmt.date(request.requestedAt)
        : tr("common.draft"),
      // 差し戻し中は赤（_specs/design.md §9 REJECTED = red）。
      color: request.status === "REJECTED" ? "red" : undefined,
      loading: request.status === "DRAFT",
    },
    approvalStage(approval, {
      approvedAt: request.approvedAt,
      fmtDate: (v) => fmt.date(v),
      tr,
    }),
    {
      key: "started",
      label: tr("sales.designRequests.start"),
      description: request.startedAt
        ? fmt.date(request.startedAt)
        : (request.assigneeName ?? tr("common.assignee")),
      loading: request.status === "PENDING",
    },
    {
      key: "completed",
      label: tr("common.completed"),
      description: request.completedAt
        ? fmt.date(request.completedAt)
        : tr("sales.designRequests.registerADrawing"),
      loading: request.status === "IN_PROGRESS",
    },
  ];

  // 上流 = 依頼のきっかけ（見積時 / 受注時）。単独依頼は両方 null。
  const sourceItems = [
    ...(request.quoteNumber
      ? [
          {
            key: request.quoteNumber,
            label: request.quoteNumber,
            href: `/sales/quotes/${request.quoteNumber}`,
            note: tr("sales.designRequests.requestedAtQuoteTime"),
          },
        ]
      : []),
    ...(request.orderLineNumber
      ? [
          {
            key: request.orderLineNumber,
            label: request.orderLineNumber,
            href: `/sales/order-lines/${request.orderLineNumber}`,
            note: tr("sales.designRequests.requestedAtOrderTime"),
          },
        ]
      : []),
  ];
  const sourceGroups: HandoffGroup[] | undefined =
    sourceItems.length > 0
      ? [
          {
            key: "trigger",
            title: tr("sales.designRequests.requestedBy"),
            items: sourceItems,
            emptyNote: "—",
          },
        ]
      : undefined;

  // 下流 = 完了で上がった図面（最新版のみ）。製品の最新図面は
  // is_latest かつ role = BLUEPRINT の 1 行（_specs/tables.md design_files）。
  const latestFiles = request.files.filter((f) => f.isLatest);
  const handoffGroups: HandoffGroup[] = [
    {
      key: "design-files",
      title: tr("common.drawing2"),
      summary:
        latestFiles.length > 0
          ? tr("sales.designRequestDetail.versionOrdinal", {
              version: latestFiles[0]?.version,
            })
          : null,
      items: latestFiles.map((f) => ({
        key: f.id,
        label: f.filename,
        done: true,
        note: tr(`enum.DESIGN_FILE_ROLE_LABEL.${f.role}`),
      })),
      emptyNote:
        request.status === "IN_PROGRESS"
          ? tr("sales.designRequests.notRegisteredCompleteItByRegistering")
          : tr("sales.designRequests.notRegisteredAddedOnceYouStart"),
    },
    ...(request.productName
      ? [
          {
            key: "product",
            title: tr("sales.designRequests.productMaster"),
            items: [
              {
                key: "product",
                label: request.productName,
                href: `/production/design-files/${request.productId}`,
                note: tr("sales.designRequests.whereTheLatestDrawingApplies"),
              },
            ],
            emptyNote: "—",
          },
        ]
      : []),
  ];
  // 差し戻し中の表示用: 最新の REJECT エントリの理由
  const lastReject = records.find((h) => h.action === "REJECT");

  /**
   * 「いまやること」カード（最上部）。承認依頼中は承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認依頼中」表示。
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
        subject={tr("sales.designRequestDetail.designRequestWithNumber", {
          number: request.requestNumber,
        })}
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
              run(
                () => startDesign(request.requestNumber),
                tr("sales.designRequests.started"),
              )
            }
          >
            {tr("sales.designRequests.start")}
          </PrimaryButton>
        }
        description={tr("sales.designRequestDetail.approvedReadyToStartDesc", {
          assignee: request.assigneeName ?? tr("common.assignee"),
        })}
        icon={<IconPlayerPlay size={20} />}
        title={tr("sales.designRequests.readyToStart")}
        tone="action"
      />
    );
  } else if (canComplete(request)) {
    // 成果物 = この依頼から出来た版。登録は 設計図 (PD06) の仕事なので、
    // 未登録のうちは「完了」ではなく登録画面へ送る（押せない完了ボタンを
    // 置いても、次に何をすればいいかが判らない）。
    actionCard = hasProducedVersion ? (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconCheck size={14} />}
            loading={isPending}
            onClick={() => setCompleteOpen(true)}
          >
            {tr("common.completed")}
          </PrimaryButton>
        }
        description={tr(
          "sales.designRequestDetail.drawingRegisteredNotifyDesc",
          { version: latestFiles[0]?.version ?? producedVersions[0] },
        )}
        icon={<IconCheck size={20} />}
        title={tr("sales.designRequests.youCanCompleteItOnceThe")}
        tone="action"
      />
    ) : (
      <ActionCard
        actions={
          <SecondaryButton
            href={registerDrawingHref}
            leftSection={<IconFile size={14} />}
          >
            {tr("sales.designRequests.registerAsADrawing")}
          </SecondaryButton>
        }
        description={tr("sales.designRequests.thisRequestSDrawingIsNot")}
        icon={<IconFile size={20} />}
        title={tr("sales.designRequests.registerADrawing2")}
        tone="wait"
      />
    );
  }

  const reassignable = canReassign(request);

  return (
    <DetailShell
      actions={
        <ResourceActions
          menuItems={[
            ...(canComplete(request) && hasProducedVersion
              ? [
                  {
                    label: tr("common.completed"),
                    icon: <IconCheck size={14} />,
                    onClick: () => setCompleteOpen(true),
                  },
                ]
              : []),
            ...(reassignable
              ? [
                  {
                    label: tr("sales.designRequests.changeTheAssignee"),
                    icon: <IconUserCog size={14} />,
                    onClick: openAssignee,
                  },
                ]
              : []),
            ...(canReopen(request)
              ? [
                  {
                    label: tr("sales.designRequests.sendBackWork"),
                    icon: <IconArrowBackUp size={14} />,
                    color: "red",
                    onClick: () => setReopenOpen(true),
                  },
                ]
              : []),
            ...(isCancellable(request)
              ? [
                  {
                    label: tr("common.cancel"),
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
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.designRequest2"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(request.createdAt)}
      status={<StatusBadge entity="DesignRequest" status={request.status} />}
      title={request.requestNumber}
      updatedAt={fmt.dateTime(request.updatedAt)}
    >
      {actionCard}

      <SummaryGrid>
        <FieldValue
          label={tr("common.requestNumber")}
          value={<DocNumber>{request.requestNumber}</DocNumber>}
        />
        <FieldValue
          label={tr("common.trigger")}
          value={
            <Badge
              color={DESIGN_TRIGGER_COLOR[request.trigger] ?? "gray"}
              variant="light"
            >
              {designTriggerLabel(request.trigger, locale) ?? request.trigger}
            </Badge>
          }
        />
        {!hasSourceDocument(request.trigger) ? (
          // 単独 — 紐づく書類が無いことを「—」ではなく明示する
          // （空欄だと「入れ忘れ」に見えて、後から探しに行かれる）。
          <FieldValue
            label={tr("common.source")}
            value={
              <Text c="dimmed" size="sm">
                {tr("sales.designRequests.noneStandalone")}
              </Text>
            }
          />
        ) : request.trigger === "QUOTE" ? (
          <FieldValue
            label={tr("common.quote")}
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
            label={tr("common.orderLine")}
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
        <FieldValue
          label={tr("common.product")}
          value={request.productName ?? "—"}
        />
        {/* 完成した版がどの系列に載るか。汎用なら全顧客の指示書から見える。 */}
        <FieldValue
          label={tr("common.orderingCustomer")}
          value={
            request.customerName ? (
              <Badge color="blue" variant="light">
                {request.customerName}
              </Badge>
            ) : (
              <Badge color="gray" variant="outline">
                {tr("common.generic")}
              </Badge>
            )
          }
        />
        <FieldValue
          label={tr("common.requestKind")}
          value={
            <Group gap="xs" wrap="nowrap">
              <Badge
                color={DESIGN_KIND_COLOR[request.kind] ?? "gray"}
                variant="light"
              >
                {designKindLabel(request.kind, locale) ?? request.kind}
              </Badge>
              {request.kindOverridden && (
                <Text c="dimmed" size="xs">
                  {tr("sales.designRequests.setManually")}
                </Text>
              )}
            </Group>
          }
        />
        <FieldValue
          label={tr("common.assignee")}
          value={request.assigneeName ?? "—"}
        />
        <FieldValue
          label={tr("common.requestedDate2")}
          value={request.desiredAt ? fmt.date(request.desiredAt) : "—"}
        />
        <FieldValue
          label={tr("sales.designRequests.priority")}
          value={
            request.priority === "HIGH" ? (
              <Badge color="red" variant="light">
                {tr("sales.designRequests.high")}
              </Badge>
            ) : (
              (designPriorityLabel(request.priority, locale) ??
              request.priority)
            )
          }
        />
        <FieldValue
          label={tr("common.createdBy")}
          value={request.createdByName ?? "—"}
        />
        <FieldValue
          label={tr("common.requestedAt")}
          value={request.requestedAt ? fmt.dateTime(request.requestedAt) : "—"}
        />
        <FieldValue
          label={tr("common.approvedAt")}
          value={request.approvedAt ? fmt.dateTime(request.approvedAt) : "—"}
        />
        <FieldValue
          label={tr("sales.designRequests.completedOn")}
          value={request.completedAt ? fmt.dateTime(request.completedAt) : "—"}
        />
      </SummaryGrid>

      <ProcedurePanel
        active={stepperActive(request.status)}
        cancelled={request.status === "CANCELLED"}
        cancelledNote={request.cancelReason}
        handoffGroups={handoffGroups}
        sourceGroups={sourceGroups}
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
                    {designHistoryActionLabel(h.action, locale)}
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
          <Tabs.Tab value="overview">{tr("common.overview")}</Tabs.Tab>
          <Tabs.Tab value="files">
            {tr("common.filesWithCount", { count: request.files.length })}
          </Tabs.Tab>
          <Tabs.Tab value="pdf">PDF</Tabs.Tab>
          <Tabs.Tab value="comments">{tr("common.comment")}</Tabs.Tab>
          <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
            {/* 改訂は「何を基に描くか」が先。設計者が最初に見る情報。 */}
            {request.kind === "REVISION" && (
              <Alert
                color="orange"
                title={tr("sales.designRequests.revision")}
                variant="light"
              >
                <Stack gap={4}>
                  <Text size="sm">
                    {tr("sales.designRequestDetail.baseDrawingLabel")}{" "}
                    {request.baseDesignFileId ? (
                      <Anchor
                        href={`/api/design-files/${encodeURIComponent(request.baseDesignFileId)}`}
                        size="sm"
                        target="_blank"
                      >
                        {request.baseDesignFileLabel ??
                          tr("sales.designRequests.openTheVersion")}
                      </Anchor>
                    ) : (
                      "—"
                    )}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {tr("sales.designRequestDetail.changeReasonLabel", {
                      reason: request.changeReason || "—",
                    })}
                  </Text>
                </Stack>
              </Alert>
            )}
            <div>
              <Text c="dimmed" mb={4} size="xs">
                {tr("common.requestDetails")}
              </Text>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {request.description || "—"}
              </Text>
            </div>
          </Stack>
        </Tabs.Panel>

        {/* 設計ファイル — 作業ファイル（添付）と、成果物の版（読み取り専用）。
            版の登録・編集・削除は 設計図 (PD06) が持つ。ここに 2 つ目の
            書き込み口を作ると、採番と is_latest の付け替えが 2 箇所になる。 */}
        <Tabs.Panel pt="md" value="files">
          <Stack gap="md">
            {/* 見えるものを先に出す（製品マスタと同じサムネイル）。
                完了前は登録済みの版がまだ無いので、その間は**添付**の中から
                表示できるものを見せる — 図面を描いている最中こそ「上げた物が
                合っているか」を確かめたいのに、完了するまで何も見えないのでは
                置く意味がない。 */}
            {thumbTarget && (
              <Stack gap={4}>
                <Box maw={320}>
                  <DesignFileThumb target={thumbTarget} />
                </Box>
                <Text c="dimmed" size="xs">
                  {thumbTarget.caption}
                </Text>
              </Stack>
            )}
            <AttachmentsPanel
              attachments={attachments}
              canDelete={canAttachFiles(request)}
              canUpload={canAttachFiles(request)}
              ownerId={request.requestNumber}
              ownerType="design_requests"
              title={tr(
                "sales.designRequests.workingFilesNotesDraftsDeliverableVersions",
              )}
            />
            <Stack gap="xs">
              <Group gap="sm" justify="space-between" wrap="wrap">
                <Text fw={600} size="sm">
                  {tr("sales.designRequests.deliverableVersion")}
                </Text>
                {request.productId != null && (
                  <SecondaryButton
                    href={`/production/design-files/${request.productId}`}
                    leftSection={<IconFile size={14} />}
                  >
                    {tr("common.managedByDrawing")}
                  </SecondaryButton>
                )}
              </Group>
              {request.files.length === 0 ? (
                <EmptyState
                  icon={<IconFile size={24} />}
                  message={tr(
                    "sales.designRequests.noVersionHasBeenRegisteredFrom",
                  )}
                />
              ) : (
                <DesignFileList rows={request.files} showSource />
              )}
            </Stack>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="pdf">
          <PdfAttachmentPanel
            downloadHref={pdfUrl("&download=1")}
            emptyMessage={tr("sales.designRequests.onceApprovedYouCanViewThe")}
            file={pdfFile}
            filename={pdfFilename}
            onRegenerate={regeneratePdf}
            previewSrc={canViewPdf ? pdfUrl(`&v=${pdfNonce}`) : undefined}
          />
        </Tabs.Panel>

        {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
        <Tabs.Panel keepMounted={false} pt="md" value="comments">
          <MemoPanel
            memos={memos}
            mode="comment"
            ownerId={request.requestNumber}
            ownerType="design_requests"
          />
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </AppTabs>

      <ConfirmModal
        confirmLabel={tr("sales.designRequests.complete")}
        loading={isPending}
        message={tr("sales.designRequestDetail.confirmCompleteMessage", {
          number: request.requestNumber,
          versions: producedVersions.join(", v"),
        })}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() =>
          run(
            () => completeDesign(request.requestNumber),
            tr("sales.designRequests.completed"),
          )
        }
        opened={completeOpen}
        title={tr("sales.designRequests.confirmCompletion")}
      />
      <ConfirmModal
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        message={tr("sales.designRequestDetail.confirmReopenMessage", {
          number: request.requestNumber,
        })}
        onClose={() => setReopenOpen(false)}
        onConfirm={() =>
          run(() => reopenDesign(request.requestNumber), tr("common.sentBack"))
        }
        opened={reopenOpen}
        title={tr("common.confirmSendingBack")}
      />

      <ModalShell
        confirmColor="red"
        confirmLabel={tr("common.cancelDocument")}
        loading={isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          run(
            () => cancelDesign(request.requestNumber, cancelReason),
            tr("common.cancelled"),
          )
        }
        opened={cancelOpen}
        title={tr("sales.designRequests.cancelTheDesignRequest")}
      >
        <Stack gap="sm">
          <Text size="sm">
            {tr("sales.designRequestDetail.confirmCancelMessage", {
              number: request.requestNumber,
            })}
          </Text>
          <Textarea
            autosize
            label={tr("common.reasonForCancelling")}
            minRows={3}
            onChange={(e) => setCancelReason(e.currentTarget.value)}
            placeholder={tr("sales.designRequests.whyItIsBeingCancelled")}
            value={cancelReason}
            withAsterisk
          />
        </Stack>
      </ModalShell>

      <ModalShell
        confirmLabel={tr("common.change")}
        loading={isPending}
        onClose={() => setAssigneeOpen(false)}
        onConfirm={() =>
          run(
            () => setDesignAssignee(request.requestNumber, assigneeDraft),
            tr("sales.designRequests.theAssigneeWasChanged"),
          )
        }
        opened={assigneeOpen}
        title={tr("sales.designRequests.changeTheAssignee2")}
      >
        <Select
          data={assigneeOptions}
          description={tr(
            "sales.designRequests.changingItNotifiesTheNewAssignee",
          )}
          label={tr("common.assignee")}
          onChange={(v) => setAssigneeDraft(v ?? "")}
          placeholder={tr("common.whoDrawsTheDrawing")}
          searchable
          value={assigneeDraft || null}
          withAsterisk
        />
      </ModalShell>
    </DetailShell>
  );
}
