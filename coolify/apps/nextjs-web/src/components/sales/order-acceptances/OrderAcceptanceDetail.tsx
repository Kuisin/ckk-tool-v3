"use client";

/**
 * OrderAcceptanceDetail — 注文請書 詳細 (SA24, design.md §8.2)。
 *
 * ライフサイクル: 取込（IMPORT）→ 下書き（DRAFT — インライン編集可）→
 * 承認依頼（REQUESTED）→ 承認（APPROVED）→ 確定（COMPLETED）→
 * アーカイブ（ARCHIVED）。
 *
 * - IMPORT: 抽出失敗は原因・対処つきの Alert + 再抽出 / 手入力へ切り替え
 *   （自動再試行の待機中は橙で「再試行中」）。処理中は案内 Alert +
 *   抽出を実行（待ち行列に積まれ損ねた行を流し直す口）/ 手入力へ切り替え。
 * - DRAFT: **閲覧 / 編集の 2 モード**。既定は閲覧（サマリ + 明細表 + 承認依頼）で、
 *   「編集」を押すと入力（基本情報 + 明細エディタ）に切り替わり、保存 /
 *   キャンセルで閲覧へ戻る。編集中は承認依頼を出さない（未保存の編集が
 *   消えるため）。
 * - REQUESTED: 承認 / 差し戻し（承認設定 MS0B のフローに従う — 代理可）。
 * - APPROVED: 確定（明細ごとに注文明細 ORD-…-NN を一括作成）。
 * - COMPLETED: 生成された注文明細リンク + アーカイブ。
 * 状態ごとの操作は最上部の ActionCard にまとめる（承認権限の有無で色が変わる
 * — 権限が無いユーザーにはグレーの「承認依頼中」カード）。
 * タブ: 添付（AttachmentsPanel）/ 履歴（HistoryPanel）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Divider,
  Grid,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArchive,
  IconCalendar,
  IconFile,
  IconInfoCircle,
  IconPencil,
  IconRefresh,
  IconSend,
  IconTransform,
  IconTruck,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  searchCustomerOptions,
  searchEndUserOptions,
  searchQuoteOptions,
  searchShipToOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  approveAcceptance,
  archiveAcceptance,
  confirmOrderLines,
  rejectAcceptance,
  requestAcceptanceCancel,
  retryExtraction,
  saveDraft,
  submitForApproval,
  takeOverManually,
} from "@/app/(dashboard)/sales/order-acceptances/actions";
import type {
  AcceptancePriceCheck,
  AcceptancePriceCheckLine,
} from "@/app/(dashboard)/sales/order-acceptances/price-check";
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
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { customerF4 } from "@/components/ui/f4-presets";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { NextStepCard } from "@/components/ui/NextStepCard";
import {
  approvalStage,
  type HandoffGroup,
  ProcedurePanel,
  type ProcedureStage,
} from "@/components/ui/ProcedurePanel";
import { SalesRepSelect } from "@/components/ui/SalesRepSelect";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  FormActions,
  FormSection,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { useIsMobile } from "@/hooks/useViewport";
import type { MemoView } from "@/lib/document-memos";
import {
  acceptanceDeliveryMethodLabel,
  acceptanceDeliveryMethodOptions,
  orderTypeLabel,
} from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import { formatMoney } from "@/lib/format";
import { parseExtractError } from "@/lib/intake-extract-error";
import type { PendingAcceptanceCancelView } from "@/lib/order-acceptance-cancel";
import {
  acceptanceReadiness,
  readinessSummary,
} from "@/lib/order-acceptance-readiness";
import {
  acceptanceTotals,
  productSummary,
} from "@/lib/order-acceptance-totals";
import type { ActionResult } from "@/lib/server-action";
import { AcceptanceCancelCard } from "./AcceptanceCancelCard";
import { IntakeDocumentPane } from "./IntakeDocumentPane";
import { IntakeReviewPanel } from "./IntakeReviewPanel";
import { MatchSuggestions } from "./MatchSuggestions";
import {
  intakeSourceBadge,
  type OrderAcceptanceView,
  sourceFileUrl,
} from "./model";
import {
  type ItemRowForm,
  newItemRow,
  OrderAcceptanceItemsEditor,
  toItemPayload,
  toItemRows,
} from "./OrderAcceptanceItemsEditor";
import { usePriceEntries } from "./usePriceEntries";

const BASE_PATH = "/sales/order-acceptances";
const SALES_ORDERS_PATH = "/sales/order-lines";

/** status → Stepper の active index（取込 / 下書き / 承認 / 確定）。 */
function stepperActive(status: string): number {
  switch (status) {
    case "IMPORT":
      return 0;
    case "DRAFT":
      return 1;
    case "REQUESTED":
      return 2;
    case "APPROVED":
      return 3;
    default:
      return 4; // COMPLETED / ARCHIVED
  }
}

const EMPTY_PRICE_CHECK: AcceptancePriceCheck = {
  lines: [],
  diffCount: 0,
  overrideCount: 0,
};

export function OrderAcceptanceDetail({
  acceptance,
  auditEntries,
  attachments,
  memos,
  approvalTrail = [],
  approval,
  priceCheck = EMPTY_PRICE_CHECK,
  plantOptions,
  workLocationOptions,
  cancelRequest = null,
  cancelApproval = null,
}: {
  acceptance: OrderAcceptanceView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 添付（document_attachments 由来、添付タブ）。 */
  attachments: AttachmentView[];
  /** 社内メモ（document_memos 由来、メモタブ）。 */
  memos: MemoView[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
  /** 承認フローの現在状態（承認 / 差し戻しのゲートと表示）。 */
  approval: ApprovalActionState;
  /** §2 価格照合結果（保存済み明細 × 価格表 — サーバー側で計算）。 */
  priceCheck?: AcceptancePriceCheck;
  /** 担当拠点の選択肢（DraftEditor 用 — サーバーで取得して渡す）。 */
  plantOptions: { value: string; label: string }[];
  /** 出荷作業場所の選択肢（lib/work-locations fetchWorkLocationOptions）。 */
  workLocationOptions: { value: string; label: string }[];
  /** 保留中のキャンセル依頼（COMPLETED のみあり得る。無ければ null）。 */
  cancelRequest?: PendingAcceptanceCancelView | null;
  /** キャンセル依頼の承認状態（cancelRequest があるときだけ使う）。 */
  cancelApproval?: ApprovalActionState | null;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("attachments");
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [cancelReqOpen, setCancelReqOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  /**
   * 下書きの表示モード。既定は**閲覧** — 開いた直後に入力欄が並んでいると、
   * 何を確認すればよいのかが分からず、触るつもりのない値まで変わり得る。
   * 「編集」で入力に切り替え、保存 / キャンセルで閲覧へ戻る。
   * ただし明細がまだ 1 行も無い下書き（手入力で作った直後・抽出を待たずに
   * 引き取った直後）は、閲覧しても空の表しかないので編集から始める。
   */
  const [editing, setEditing] = useState(
    () => acceptance.status === "DRAFT" && acceptance.items.length === 0,
  );
  /**
   * 左の書類ペインを畳んでいるか（デスクトップのみ）。列幅を決めるのは
   * この Grid なので、開閉の状態も**ペインではなくここ**が持つ。
   * 畳むと左は細い帯（span="content"）になり、右が残り全部（span="auto"）を
   * 取る — 明細エディタは 1 行に 5 欄あるので、この差で折り返しが消える。
   */
  const [docCollapsed, setDocCollapsed] = useState(false);
  const isMobile = useIsMobile();
  // モバイルは縦積み（書類はペイン内の折りたたみ）— 帯にはしない。
  const railed = docCollapsed && !isMobile;

  const a = acceptance;
  const sourceDef = intakeSourceBadge(tr)[a.source];

  // 抽出失敗は分類済みの複数行メッセージ（lib/intake-extract-error）。
  // 旧形式（1 行）もそのまま読める。
  const failure = a.extractError ? parseExtractError(a.extractError) : null;

  // 抽出はバックグラウンドの列で走るので、待っている間は定期的に見に行く
  // （完了しても画面は自分では変わらないため）。一覧と同じ 30 秒間隔。
  // 自動再試行の待機中も「まだ動いている」ので更新を続ける。
  const awaitingExtraction =
    a.status === "IMPORT" && (!failure || failure.retrying);
  useEffect(() => {
    if (!awaitingExtraction) return;
    const timer = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(timer);
  }, [awaitingExtraction, router]);
  const fileUrl = a.sourceFilename ? sourceFileUrl(a) : null;

  // ── 手続き状況（取込 → 下書き → 承認 → 確定）─────────────────────────────
  const stages: ProcedureStage[] = [
    {
      key: "import",
      label: tr("sales.orderAcceptances.intake"),
      description: sourceDef.label,
      loading: a.status === "IMPORT",
    },
    {
      key: "draft",
      label: tr("common.draft"),
      description: tr("sales.orderAcceptances.reviewAndEdit"),
      loading: a.status === "DRAFT",
    },
    approvalStage(approval, { fmtDate: (v) => fmt.date(v), tr }),
    {
      key: "completed",
      label: tr("common.confirmed"),
      description: a.completedAt
        ? fmt.date(a.completedAt)
        : tr("sales.orderAcceptances.toTheOrderLines"),
      loading: a.status === "APPROVED",
    },
  ];

  // 上流 = 元になった見積書（FAX 直受けの注文書には無い）。
  const sourceGroups: HandoffGroup[] | undefined = a.quoteNumber
    ? [
        {
          key: "quote",
          title: tr("common.quote"),
          items: [
            {
              key: a.quoteNumber,
              label: a.quoteNumber,
              href: `/sales/quotes/${a.quoteNumber}`,
              note: tr(
                "sales.orderAcceptances.quoteThisOrderAcceptanceCameFrom",
              ),
            },
          ],
          emptyNote: "—",
        },
      ]
    : undefined;

  // 下流 = 確定で生成された注文明細（1 明細行 = 1 注文明細）。
  const handoffGroups: HandoffGroup[] = [
    {
      key: "order-lines",
      title: tr("common.orderLine"),
      summary:
        a.orderLineNumbers.length > 0
          ? tr("common.itemsCount", { count: a.orderLineNumbers.length })
          : null,
      items: a.orderLineNumbers.map((n) => ({
        key: n,
        label: n,
        href: `${SALES_ORDERS_PATH}/${n}`,
        done: true,
        note: null,
      })),
      emptyNote:
        a.status === "APPROVED"
          ? tr("sales.orderAcceptances.notExpandedOrderLinesAreCreated")
          : tr("sales.orderAcceptances.notExpandedExpandedIntoOrderLines"),
    },
  ];

  // 承認依頼の可否 — 確定と同じ完成条件（サーバーの submitForApproval と
  // 同じ関数）。足りない項目があるうちはボタンを押せなくし、理由をカードに出す。
  const readiness = acceptanceReadiness(
    {
      customerBpId: a.customerBpId,
      deliveryMethod: a.deliveryMethod,
      endUserBpId: a.endUserBpId,
      items: a.items,
    },
    tr,
  );

  // 明細の合計（ヘッダ要約と明細表の合計行で同じ数字を出す — lib で 1 本化）。
  const totals = acceptanceTotals(a.items);
  const products = productSummary(a.items, tr);

  // §2 価格照合（P0-8）— 差異行・上書き行と、明細 id → 照合結果の索引。
  // 差異（説明のつかない食い違い）と上書き（人が宣言した単価）は別に出す。
  const diffLines = priceCheck.lines.filter((l) => l.diff);
  const overrideLines = priceCheck.lines.filter((l) => l.overridden);
  const checkByItemId = new Map<string, AcceptancePriceCheckLine>(
    priceCheck.lines.map((l) => [l.itemId, l]),
  );

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: tr("sales.orderAcceptanceDetail.orderAcceptanceWithNumber", {
            number: a.number,
          }),
          color: "green",
        });
        setRejectOpen(false);
        setRejectReason("");
        setDeployOpen(false);
        setArchiveOpen(false);
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

  /** 確定 — 成功時は生成された注文明細番号を通知する。 */
  const deploy = () => {
    startTransition(async () => {
      const result = await confirmOrderLines(a.number);
      if (result.ok) {
        notifications.show({
          title: tr("common.confirmed2"),
          message: tr("sales.orderAcceptanceDetail.orderLinesCreatedMessage", {
            numbers: result.data.numbers.join(", "),
          }),
          color: "green",
        });
        setDeployOpen(false);
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

  /**
   * 承認依頼 — 価格差異があるときは確認モーダル（design.md §10.4）を挟み、
   * acknowledgePriceDiff: true で再実行する（サーバー側でも再照合される）。
   */
  const requestApproval = () => {
    if (diffLines.length === 0) {
      run(() => submitForApproval(a.number), tr("common.approvalRequested"));
      return;
    }
    modals.openConfirmModal({
      title: tr("sales.orderAcceptances.checkThePriceMismatch"),
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {tr("sales.orderAcceptances.theLinesBelowDoNotMatch")}
          </Text>
          {diffLines.map((l) => (
            <Text key={l.itemId} size="sm">
              {tr("sales.orderAcceptanceDetail.lineDiffText", {
                row: l.row,
                actual: formatMoney(l.actual),
                expected: formatMoney(l.expected),
              })}
            </Text>
          ))}
        </Stack>
      ),
      labels: {
        confirm: tr("sales.orderAcceptances.checkTheDifferenceAndSubmit"),
        cancel: tr("common.back2"),
      },
      confirmProps: { color: "orange" },
      onConfirm: () =>
        run(
          () => submitForApproval(a.number, true),
          tr("common.approvalRequested"),
        ),
    });
  };

  /**
   * 「いまやること」カード（最上部）。承認依頼中は承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認依頼中」表示。
   */
  let actionCard: ReactNode = null;
  if (cancelRequest && cancelApproval) {
    actionCard = (
      <AcceptanceCancelCard approval={cancelApproval} request={cancelRequest} />
    );
  } else if (a.status === "DRAFT") {
    actionCard = editing ? (
      // 編集中は承認依頼を出さない — 押した瞬間に未保存の編集が消えるため。
      // 保存 / キャンセル（画面下に貼り付く FormActions）に集中させる。
      <ActionCard
        description={tr("sales.orderAcceptances.saveOnceYouHaveChangedIt")}
        icon={<IconPencil size={20} />}
        title={tr("sales.orderAcceptances.editing")}
        tone="action"
      />
    ) : (
      <ActionCard
        actions={
          <PrimaryButton
            disabled={!readiness.ok}
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={requestApproval}
          >
            {tr("common.approvalRequest")}
          </PrimaryButton>
        }
        description={
          readiness.ok
            ? tr("sales.orderAcceptances.compareItWithTheDocumentAnd")
            : tr("sales.orderAcceptanceDetail.fixViaEditMessage", {
                summary: readinessSummary(readiness.issues, tr),
              })
        }
        icon={<IconSend size={20} />}
        title={
          readiness.ok
            ? tr("sales.orderAcceptances.reviewItAndSendItFor")
            : tr("sales.orderAcceptanceDetail.approvalNeedsMoreInputs", {
                count: readiness.issues.length,
              })
        }
        tone="action"
      />
    );
  } else if (a.status === "REQUESTED") {
    // 承認・差し戻しは 4 書類共通のカードに任せる（段数は承認設定 MS0B）。
    // 依頼側（DRAFT）は完成条件・価格差異の確認があるので上の分岐が持つ。
    actionCard = (
      <ApprovalActionCard
        approval={approval}
        canRequest={false}
        onApprove={() => approveAcceptance(a.number)}
        onReject={(reason) => rejectAcceptance(a.number, reason)}
        rejectReason={null}
        subject={tr("sales.orderAcceptanceDetail.orderAcceptanceWithNumber", {
          number: a.number,
        })}
      />
    );
  } else if (a.status === "APPROVED") {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconTransform size={14} />}
            loading={isPending}
            onClick={() => setDeployOpen(true)}
          >
            {tr("common.confirmed")}
          </PrimaryButton>
        }
        description={tr("sales.orderAcceptances.createsAnOrderLineOrdNn")}
        icon={<IconTransform size={20} />}
        title={tr("sales.orderAcceptances.readyToConfirm")}
        tone="action"
      />
    );
  } else if (a.status === "COMPLETED") {
    // 確定後の次のステップ = 出荷書の作成（この注文請書をプリセレクト）。
    // アーカイブ・キャンセル依頼は例外操作なのでメニューに置く。
    actionCard = (
      <NextStepCard
        buttonLabel={tr("common.createADeliveryOrder")}
        description={tr("sales.orderAcceptances.opensTheDeliveryOrderFormWith")}
        href={`/shipping/delivery-orders/new?acceptance=${a.number}`}
        icon={<IconTruck size={20} />}
        title={tr("common.nextStepCreateADeliveryOrder")}
      />
    );
  }

  return (
    <DetailShell
      actions={
        <ResourceActions
          // 下書きの閲覧中だけ「編集」を出す（design.md §8.2 の定位置）。
          // 操作は状態に依らず全て並べ、押せないものはグレーアウトで理由を出す。
          menuItems={[
            {
              label: tr("common.createADeliveryOrder"),
              icon: <IconTruck size={14} />,
              disabled: a.status !== "COMPLETED",
              disabledReason:
                a.status === "COMPLETED"
                  ? undefined
                  : tr("sales.orderAcceptances.youCanCreateItOnceConfirmed"),
              onClick: () =>
                router.push(
                  `/shipping/delivery-orders/new?acceptance=${a.number}`,
                ),
            },
            {
              label: tr("common.archived2"),
              icon: <IconArchive size={14} />,
              disabled: a.status !== "COMPLETED",
              disabledReason:
                a.status === "COMPLETED"
                  ? undefined
                  : tr("sales.orderAcceptances.youCanRunItOnceConfirmed"),
              onClick: () => setArchiveOpen(true),
            },
            // 明細単位のキャンセルは無い — 注文請書ごと依頼して
            // 承認設定（MS0B）の「注文請書キャンセル」フローを通す。
            {
              label: tr("sales.orderAcceptances.cancellationRequest"),
              icon: <IconX size={14} />,
              color: "red",
              divider: true,
              disabled: a.status !== "COMPLETED" || cancelRequest != null,
              disabledReason:
                cancelRequest != null
                  ? tr(
                      "sales.orderAcceptances.thereIsACancellationRequestPending",
                    )
                  : a.status !== "COMPLETED"
                    ? tr("sales.orderAcceptances.youCanRequestItOnceConfirmed")
                    : undefined,
              onClick: () => setCancelReqOpen(true),
            },
          ]}
          onEdit={
            a.status === "DRAFT" && !editing
              ? () => setEditing(true)
              : undefined
          }
        />
      }
      breadcrumbs={[
        tr("common.sales"),
        { label: tr("common.orderAcceptance"), href: BASE_PATH },
        tr("common.detailBreadcrumb"),
      ]}
      createdAt={fmt.dateTime(a.createdAt)}
      status={<StatusBadge entity="OrderAcceptanceIntake" status={a.status} />}
      title={a.number}
      updatedAt={fmt.dateTime(a.updatedAt)}
    >
      {/*
        書類は **状態に関わらず常に** 左に出す（取込中・失敗中でも見たい）。
        右は状態ごとの中身。狭い画面では縦積み（書類は折りたたみ）。
      */}
      {actionCard}

      <Grid gap="md">
        <Grid.Col span={railed ? "content" : { base: 12, lg: 5 }}>
          <IntakeDocumentPane
            collapsed={docCollapsed}
            filename={a.sourceFilename}
            fileUrl={fileUrl}
            mimeType={a.sourceMimeType}
            onToggleCollapse={() => setDocCollapsed((v) => !v)}
          />
        </Grid.Col>
        <Grid.Col span={railed ? "auto" : { base: 12, lg: 7 }}>
          <Stack gap="md">
            {/* 取込中 / 抽出失敗（IMPORT） */}
            {a.status === "IMPORT" &&
              (failure ? (
                <Alert
                  color={failure.retrying ? "orange" : "red"}
                  icon={
                    failure.retrying ? (
                      <IconRefresh size={16} />
                    ) : (
                      <IconAlertTriangle size={16} />
                    )
                  }
                  title={failure.summary}
                  variant="light"
                >
                  <Stack gap="xs">
                    {failure.cause && <Text size="sm">{failure.cause}</Text>}
                    <Text fw={500} size="sm">
                      {failure.hint}
                    </Text>
                    {failure.attempt && failure.maxAttempts ? (
                      <Text c="dimmed" size="xs">
                        {failure.retrying
                          ? tr(
                              "sales.orderAcceptanceDetail.autoRetryInProgress",
                              {
                                attempt: failure.attempt,
                                maxAttempts: failure.maxAttempts,
                              },
                            )
                          : tr(
                              "sales.orderAcceptanceDetail.autoRetryAllFailed",
                              {
                                attempt: failure.attempt,
                                maxAttempts: failure.maxAttempts,
                              },
                            )}
                      </Text>
                    ) : null}
                    {failure.detail && (
                      <Text c="dimmed" ff="mono" size="xs">
                        {failure.detail}
                      </Text>
                    )}
                    <Group>
                      <SecondaryButton
                        leftSection={<IconRefresh size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => retryExtraction(a.number),
                            tr(
                              "sales.orderAcceptances.reExtractionWasQueuedItRuns",
                            ),
                          )
                        }
                      >
                        {tr("sales.orderAcceptances.reExtract")}
                      </SecondaryButton>
                      <SecondaryButton
                        leftSection={<IconPencil size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => takeOverManually(a.number),
                            tr("sales.orderAcceptances.switchedToManualEntry"),
                          )
                        }
                      >
                        {tr("sales.orderAcceptances.switchToManualEntry")}
                      </SecondaryButton>
                    </Group>
                  </Stack>
                </Alert>
              ) : (
                <Alert
                  color="blue"
                  icon={<IconInfoCircle size={16} />}
                  title={tr("sales.orderAcceptances.extracting")}
                  variant="light"
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      {tr(
                        "sales.orderAcceptances.queuedOrRunningForAutomaticExtraction",
                      )}
                    </Text>
                    <Group>
                      {/* 待ち行列はプロセス内 — 取込直後にブラウザやサーバーが
                          落ちて積まれ損ねた行を、その場で流し直せるようにする。 */}
                      <SecondaryButton
                        leftSection={<IconRefresh size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => retryExtraction(a.number),
                            tr(
                              "sales.orderAcceptances.extractionWasQueuedItRunsIn",
                            ),
                          )
                        }
                      >
                        {tr("sales.orderAcceptances.runExtraction")}
                      </SecondaryButton>
                      <SecondaryButton
                        leftSection={<IconPencil size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => takeOverManually(a.number),
                            tr("sales.orderAcceptances.switchedToManualEntry"),
                          )
                        }
                      >
                        {tr(
                          "sales.orderAcceptances.enterItByHandWithoutWaiting",
                        )}
                      </SecondaryButton>
                    </Group>
                  </Stack>
                </Alert>
              ))}

            {/* §2 価格差異サマリ（design.md §16.3 — ページ滞在中は常時表示） */}
            {priceCheck.diffCount > 0 && (
              <Alert
                color="orange"
                icon={<IconAlertTriangle size={16} />}
                title={tr("sales.orderAcceptanceDetail.priceMismatchCount", {
                  count: priceCheck.diffCount,
                })}
                variant="light"
              >
                <Stack gap={4}>
                  <Text size="sm">
                    {tr("sales.orderAcceptances.aLineSUnitPriceDoes")}
                  </Text>
                  {diffLines.map((l) => (
                    <Text key={l.itemId} size="sm">
                      {tr("sales.orderAcceptanceDetail.lineDiffText", {
                        row: l.row,
                        actual: formatMoney(l.actual),
                        expected: formatMoney(l.expected),
                      })}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            {/*
              §2 上書きサマリ — こちらは警告ではない（人が宣言した単価）。
              ただし承認するのは「価格表どおり」ではなくこの単価なので、
              承認者が読める場所に必ず出す。
            */}
            {priceCheck.overrideCount > 0 && (
              <Alert
                color="violet"
                icon={<IconInfoCircle size={16} />}
                title={tr("sales.orderAcceptanceDetail.priceOverrideCount", {
                  count: priceCheck.overrideCount,
                })}
                variant="light"
              >
                <Stack gap={4}>
                  <Text size="sm">
                    {tr(
                      "sales.orderAcceptances.theseLinesUseAnOverriddenPrice",
                    )}
                  </Text>
                  {overrideLines.map((l) => (
                    <Text key={l.itemId} size="sm">
                      {tr("sales.orderAcceptanceDetail.lineOverrideText", {
                        row: l.row,
                        actual: formatMoney(l.actual),
                        expected: formatMoney(l.expected),
                      })}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            {a.status === "DRAFT" && editing ? (
              <DraftEditor
                acceptance={a}
                onClose={() => setEditing(false)}
                plantOptions={plantOptions}
                workLocationOptions={workLocationOptions}
              />
            ) : (
              <>
                {/* 下書きの閲覧モードでも AI 突合の結果は出す（直す前に読む） */}
                {a.status === "DRAFT" && (
                  <IntakeReviewPanel review={a.review} />
                )}
                <SummaryGrid>
                  <FieldValue
                    label={tr("common.number")}
                    value={<DocNumber>{a.number}</DocNumber>}
                  />
                  <FieldValue
                    label={tr("common.importedFrom")}
                    value={
                      <Badge color={sourceDef.color} size="sm" variant="light">
                        {sourceDef.label}
                      </Badge>
                    }
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.sourceFile")}
                    value={
                      fileUrl ? (
                        <Anchor
                          href={fileUrl}
                          rel="noopener noreferrer"
                          size="sm"
                          target="_blank"
                        >
                          <Group component="span" gap={4} wrap="nowrap">
                            <IconFile size={14} />
                            {a.sourceFilename}
                          </Group>
                        </Anchor>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <FieldValue
                    label={tr("common.customer")}
                    value={
                      a.customerName ?? (
                        <Badge color="orange" size="sm" variant="light">
                          {tr("common.notIdentified")}
                        </Badge>
                      )
                    }
                  />
                  <FieldValue
                    label={tr("common.salesRep")}
                    value={a.salesRepName}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.shipTo")}
                    value={a.shipToName}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.deliveryMethod")}
                    value={acceptanceDeliveryMethodLabel(
                      a.deliveryMethod,
                      locale,
                    )}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.endUser")}
                    value={a.endUserName}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.assignedSite")}
                    value={a.assignedPlantName}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.shippingWorkLocation")}
                    value={a.shippingWorkLocationName}
                  />
                  <FieldValue
                    label={tr("common.customerOrderRef")}
                    value={a.customerOrderRef}
                  />
                  <FieldValue
                    label={tr("common.quote")}
                    value={
                      a.quoteNumber ? (
                        <Anchor
                          component={Link}
                          href={`/sales/quotes/${encodeURIComponent(a.quoteNumber)}`}
                          size="sm"
                        >
                          <DocNumber>{a.quoteNumber}</DocNumber>
                        </Anchor>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <FieldValue
                    label={tr("common.orderDate2")}
                    value={fmt.date(a.orderDate)}
                  />
                  {/*
                    何を・どれだけ・いくらで受けた書類なのかは、これまで明細表を
                    開かないと分からなかった。ヘッダの 3 項目で足りるようにする。
                  */}
                  <FieldValue
                    label={tr("common.product")}
                    value={
                      products.names.length > 1 ? (
                        <Tooltip
                          label={products.names.join(" / ")}
                          multiline
                          w={320}
                          withinPortal
                        >
                          <Text size="sm" span>
                            {products.label}
                          </Text>
                        </Tooltip>
                      ) : (
                        products.label
                      )
                    }
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.linesTotalQuantity")}
                    value={
                      <Text className="tabular-nums" size="sm" span>
                        {tr("common.itemsCount", { count: totals.lineCount })} /{" "}
                        {totals.quantity.toLocaleString("ja-JP")}
                      </Text>
                    }
                  />
                  <FieldValue
                    label={tr("common.totalAmount")}
                    value={
                      <Group gap="xs" wrap="wrap">
                        <MoneyText value={totals.amount} />
                        {/* 単価未入力の行は足せていない — 総額と読まれないように。 */}
                        {totals.unpricedCount > 0 && (
                          <Badge color="orange" size="xs" variant="light">
                            {tr(
                              "sales.orderAcceptanceDetail.excludingUnpricedCount",
                              {
                                count: totals.unpricedCount,
                              },
                            )}
                          </Badge>
                        )}
                      </Group>
                    }
                  />
                  <FieldValue
                    label={tr("common.createdBy")}
                    value={a.createdByName}
                  />
                  <FieldValue
                    label={tr("sales.orderAcceptances.expandedAt")}
                    value={a.completedAt ? fmt.dateTime(a.completedAt) : "—"}
                  />
                  {/* 備考は 1 行まるごと使う — 3 列の枠だと読めない */}
                  <FieldValue
                    fullWidth
                    label={tr("common.notes")}
                    value={a.notes}
                  />
                </SummaryGrid>

                {/* 明細（読み取り専用） */}
                <Paper p="md" radius="md" withBorder>
                  <Title mb="sm" order={5}>
                    {tr("common.lineItemsWithCount", { count: a.items.length })}
                  </Title>
                  <Table.ScrollContainer minWidth={1000}>
                    <Table highlightOnHover striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>{tr("common.orderLine")}</Table.Th>
                          <Table.Th>
                            {tr("sales.orderAcceptances.workOrdersAllocated")}
                          </Table.Th>
                          <Table.Th>{tr("common.product")}</Table.Th>
                          <Table.Th>
                            {tr("sales.orderAcceptances.itemNameExtracted")}
                          </Table.Th>
                          <Table.Th>{tr("common.type2")}</Table.Th>
                          <Table.Th ta="right">
                            {tr("common.quantity")}
                          </Table.Th>
                          <Table.Th ta="right">
                            {tr("common.unitPrice")}
                          </Table.Th>
                          <Table.Th ta="right">{tr("common.amount")}</Table.Th>
                          <Table.Th>{tr("common.deliveryDate")}</Table.Th>
                          <Table.Th>{tr("common.notes")}</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {a.items.map((it) => {
                          const lc = checkByItemId.get(it.id);
                          return (
                            <Table.Tr key={it.id}>
                              <Table.Td>
                                {/* 確定済みの行は注文明細（SA25）へリンク。
                                    未確定は枝番未採番のため番号なし。 */}
                                {it.lineNumber ? (
                                  <Anchor
                                    ff="mono"
                                    href={`${SALES_ORDERS_PATH}/${it.lineNumber}`}
                                    size="sm"
                                  >
                                    {it.lineNumber}
                                  </Anchor>
                                ) : (
                                  <Text c="dimmed" size="sm">
                                    —
                                  </Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {/* 割当済みの指示書（#ロット番号 × 割当数）。
                                    分割は複数行、統合は複数明細が同じ番号を持つ。 */}
                                {it.workOrders.length > 0 ? (
                                  <Stack gap={2}>
                                    {it.workOrders.map((wo) => (
                                      <Group
                                        gap={6}
                                        key={wo.workOrderNumber}
                                        wrap="nowrap"
                                      >
                                        <Anchor
                                          ff="mono"
                                          href={`/production/work-orders/${wo.workOrderNumber}`}
                                          size="sm"
                                        >
                                          #{wo.workOrderNumber}
                                        </Anchor>
                                        <Text
                                          c="dimmed"
                                          className="tabular-nums"
                                          size="xs"
                                        >
                                          × {wo.quantity}
                                        </Text>
                                      </Group>
                                    ))}
                                  </Stack>
                                ) : (
                                  <Text c="dimmed" size="sm">
                                    —
                                  </Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {it.productLabel ?? (
                                  <Badge
                                    color="orange"
                                    size="sm"
                                    variant="light"
                                  >
                                    {tr("common.productNotIdentified")}
                                  </Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Text c="dimmed" size="sm">
                                  {it.productText ?? "—"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {orderTypeLabel(it.orderType, locale) ??
                                  it.orderType}
                              </Table.Td>
                              <Table.Td className="tabular-nums" ta="right">
                                {it.quantity}
                              </Table.Td>
                              <Table.Td ta="right">
                                <Stack align="flex-end" gap={2}>
                                  {it.unitPrice != null ? (
                                    <MoneyText value={it.unitPrice} />
                                  ) : (
                                    <Text c="dimmed" size="sm">
                                      {tr("sales.orderAcceptances.notEntered")}
                                    </Text>
                                  )}
                                  {lc?.diff && (
                                    <Badge
                                      color="orange"
                                      size="xs"
                                      variant="light"
                                    >
                                      {tr(
                                        "sales.orderAcceptanceDetail.priceMismatchExpected",
                                        { expected: formatMoney(lc.expected) },
                                      )}
                                    </Badge>
                                  )}
                                  {/*
                                    上書き — 価格表と違うのは意図なので警告色に
                                    しない。ただし価格表の単価は併記する
                                    （何から外した単価なのかが分からないと、
                                    承認する側は判断できない）。
                                    印は保存済みの行（it）から出す — 確定済み・
                                    アーカイブ済みでは照合を回さないので、
                                    照合結果（lc）から出すと消えてしまう。
                                    「なぜこの単価なのか」は後から一番よく
                                    訊かれる。
                                  */}
                                  {it.priceOverridden && (
                                    <Badge
                                      color="violet"
                                      size="xs"
                                      variant="light"
                                    >
                                      {lc?.expected != null &&
                                      lc.expected !== it.unitPrice
                                        ? tr(
                                            "sales.orderAcceptanceDetail.priceOverriddenFromList",
                                            {
                                              expected: formatMoney(
                                                lc.expected,
                                              ),
                                            },
                                          )
                                        : tr(
                                            "sales.orderAcceptanceDetail.priceOverridden",
                                          )}
                                    </Badge>
                                  )}
                                  {lc?.unpriced && (
                                    <Badge
                                      color="gray"
                                      size="xs"
                                      variant="light"
                                    >
                                      {tr("common.noPriceList")}
                                    </Badge>
                                  )}
                                </Stack>
                              </Table.Td>
                              <Table.Td ta="right">
                                {it.unitPrice != null ? (
                                  <MoneyText
                                    value={it.unitPrice * it.quantity}
                                  />
                                ) : (
                                  "—"
                                )}
                              </Table.Td>
                              <Table.Td className="tabular-nums">
                                {fmt.date(it.deliveryDate)}
                              </Table.Td>
                              <Table.Td>
                                <Text c="dimmed" size="xs">
                                  {it.notes ?? "—"}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                      {/*
                        合計行。単価未入力の行は金額に足せないので、その件数を
                        添える（少ない金額を総額と読まれるのを防ぐ）。
                      */}
                      {a.items.length > 0 && (
                        <Table.Tfoot>
                          <Table.Tr>
                            <Table.Th colSpan={5} ta="right">
                              {tr("common.total")}
                            </Table.Th>
                            <Table.Th className="tabular-nums" ta="right">
                              {totals.quantity.toLocaleString("ja-JP")}
                            </Table.Th>
                            <Table.Th ta="right">
                              {totals.unpricedCount > 0 && (
                                <Text c="dimmed" fw={400} size="xs">
                                  {tr(
                                    "sales.orderAcceptanceDetail.unenteredCount",
                                    {
                                      count: totals.unpricedCount,
                                    },
                                  )}
                                </Text>
                              )}
                            </Table.Th>
                            <Table.Th ta="right">
                              <MoneyText fw={700} value={totals.amount} />
                            </Table.Th>
                            <Table.Th colSpan={2} />
                          </Table.Tr>
                        </Table.Tfoot>
                      )}
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
              </>
            )}

            <ProcedurePanel
              active={stepperActive(a.status)}
              handoffGroups={handoffGroups}
              sourceGroups={sourceGroups}
              stages={stages}
            >
              {a.status === "ARCHIVED" && (
                <Text c="dimmed" mt="md" size="xs">
                  {tr("sales.orderAcceptanceDetail.archivedAtNote", {
                    date: fmt.dateTime(a.archivedAt),
                  })}
                </Text>
              )}

              {countTrailRecords(approvalTrail) > 0 && (
                <>
                  <Divider my="md" />
                  <ApprovalTrailList trail={approvalTrail} />
                </>
              )}
            </ProcedurePanel>

            <AppTabs onChange={setTab} value={tab}>
              <Tabs.List>
                <Tabs.Tab value="attachments">
                  {tr("common.attachmentsWithCount", {
                    count: attachments.length,
                  })}
                </Tabs.Tab>
                <Tabs.Tab value="memo">{tr("common.memo")}</Tabs.Tab>
                <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel pt="md" value="attachments">
                <AttachmentsPanel
                  attachments={attachments}
                  canDelete={a.status !== "ARCHIVED"}
                  canUpload={a.status !== "ARCHIVED"}
                  ownerId={a.number}
                  ownerType="order_acceptances"
                />
              </Tabs.Panel>

              {/* keepMounted={false}: エディタ（prosemirror）はタブを開くまで読み込まない。 */}
              <Tabs.Panel keepMounted={false} pt="md" value="memo">
                <MemoPanel
                  memos={memos}
                  mode="memo"
                  ownerId={a.number}
                  ownerType="order_acceptances"
                />
              </Tabs.Panel>

              <Tabs.Panel pt="md" value="history">
                <HistoryPanel entries={auditEntries} />
              </Tabs.Panel>
            </AppTabs>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* 差し戻し（理由必須 → DRAFT へ戻す） */}
      <ModalShell
        confirmColor="red"
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!rejectReason.trim()) {
            notifications.show({
              title: tr("common.error2"),
              message: tr("common.enterAReasonForSendingIt"),
              color: "red",
            });
            return;
          }
          run(
            () => rejectAcceptance(a.number, rejectReason),
            tr("common.sentBack"),
          );
        }}
        opened={rejectOpen}
        size="sm"
        title={tr("common.confirmSendingBack")}
      >
        <Textarea
          autosize
          label={tr("common.reasonForSendingBack")}
          minRows={3}
          onChange={(e) => setRejectReason(e.currentTarget.value)}
          placeholder={tr("common.enterAReason")}
          value={rejectReason}
          withAsterisk
        />
      </ModalShell>

      {/* 確定の確認 */}
      <ModalShell
        confirmLabel={tr("common.expand")}
        loading={isPending}
        onClose={() => setDeployOpen(false)}
        onConfirm={deploy}
        opened={deployOpen}
        size="sm"
        title={tr("common.confirm")}
      >
        <Text size="sm">
          {tr("sales.orderAcceptanceDetail.confirmDeployMessage", {
            count: a.items.length,
            number: a.number,
            lastBranch: String(a.items.length).padStart(2, "0"),
          })}
        </Text>
      </ModalShell>

      {/* アーカイブの確認 */}
      <ModalShell
        confirmLabel={tr("common.archive")}
        loading={isPending}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() =>
          run(() => archiveAcceptance(a.number), tr("common.archived"))
        }
        opened={archiveOpen}
        size="sm"
        title={tr("sales.orderAcceptances.confirmArchiving")}
      >
        <Text size="sm">
          {tr("sales.orderAcceptanceDetail.confirmArchiveMessage", {
            number: a.number,
          })}
        </Text>
      </ModalShell>

      {/* キャンセル依頼（理由必須）。承認設定があれば保留、無ければ即適用。 */}
      <ModalShell
        confirmColor="red"
        confirmDisabled={!cancelReason.trim()}
        confirmLabel={tr("sales.orderAcceptances.requestCancellation")}
        loading={isPending}
        onClose={() => setCancelReqOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await requestAcceptanceCancel(
              a.number,
              cancelReason,
            );
            if (result.ok) {
              setCancelReqOpen(false);
              setCancelReason("");
              notifications.show({
                title: result.data?.pending
                  ? tr(
                      "sales.orderAcceptances.approvalWasRequestedForTheCancellation",
                    )
                  : tr("common.cancelled"),
                message: result.data?.pending
                  ? tr("sales.orderAcceptances.theOrderAcceptanceAndItsLines")
                  : tr("sales.orderAcceptances.everyLineWasCancelled"),
                color: result.data?.pending ? "yellow" : "green",
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
        opened={cancelReqOpen}
        size="sm"
        title={tr("sales.orderAcceptances.cancellationRequest")}
      >
        <Text size="sm">
          {tr("sales.orderAcceptanceDetail.confirmCancelRequestMessage", {
            number: a.number,
          })}
        </Text>
        <Textarea
          label={tr("common.reasonForCancelling")}
          minRows={3}
          onChange={(e) => setCancelReason(e.currentTarget.value)}
          placeholder={tr("common.enterAReason")}
          value={cancelReason}
          withAsterisk
        />
      </ModalShell>
    </DetailShell>
  );
}

/**
 * DraftEditor — DRAFT の編集モード（基本情報 + 明細 + 保存 / キャンセル）。
 *
 * 編集モードのときだけマウントされるため、初期値は props から安全に取れる
 * （＝閲覧に戻って入り直すと、必ず保存済みの値から始まる）。
 * 保存もキャンセルも `onClose` で閲覧モードへ戻す。
 */
function DraftEditor({
  acceptance,
  onClose,
  plantOptions,
  workLocationOptions,
}: {
  acceptance: OrderAcceptanceView;
  /** 閲覧モードへ戻す（保存成功 / キャンセル）。 */
  onClose: () => void;
  /** 担当拠点の選択肢（有効のみ）。 */
  plantOptions: { value: string; label: string }[];
  /** 出荷作業場所の選択肢（グループ / 場所）。 */
  workLocationOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const a = acceptance;
  const sourceDef = intakeSourceBadge(tr)[a.source];

  const [customerId, setCustomerId] = useState<string | null>(a.customerBpId);
  // 顧客ピッカーに出すラベル。候補ボタンで選んだときも表示が追随するよう、
  // id だけでなく {value,label} で持つ。
  const [customerOption, setCustomerOption] = useState<{
    value: string;
    label: string;
  } | null>(
    a.customerBpId && a.customerName
      ? { value: a.customerBpId, label: a.customerName }
      : null,
  );
  const [salesRepId, setSalesRepId] = useState<string | null>(a.salesRepId);
  const [shipToBpId, setShipToBpId] = useState<string | null>(a.shipToBpId);
  const [deliveryMethod, setDeliveryMethod] = useState<
    "NORMAL" | "DIRECT_TO_USER"
  >(a.deliveryMethod);
  const [endUserBpId, setEndUserBpId] = useState<string | null>(a.endUserBpId);
  const [endUserError, setEndUserError] = useState<string | null>(null);
  const [assignedPlantId, setAssignedPlantId] = useState<string | null>(
    a.assignedPlantId,
  );
  const [shippingWorkLocationId, setShippingWorkLocationId] = useState<
    string | null
  >(a.shippingWorkLocationId);
  const [customerOrderRef, setCustomerOrderRef] = useState(
    a.customerOrderRef ?? "",
  );
  const [quoteNumber, setQuoteNumber] = useState(a.quoteNumber ?? "");
  const [orderDate, setOrderDate] = useState<string | null>(a.orderDate);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [items, setItems] = useState<ItemRowForm[]>(() =>
    a.items.length > 0 ? toItemRows(a.items) : [newItemRow()],
  );
  // 明細の単価は既定で価格表が持つ（§2）。編集中の顧客の価格表を引いて、
  // 行ごとの単価をその場で解決する（保存済み結果の照合ではなく、いまの入力
  // に対する解決 — 顧客や数量を変えた瞬間に単価が追随する）。
  const priceEntries = usePriceEntries(customerId);
  const priceContext = { customerBpId: customerId, priceEntries };

  /** 入力内容の指紋 — 変更の有無だけを見るので中身の意味は問わない。 */
  const fingerprint = JSON.stringify([
    customerId,
    salesRepId,
    shipToBpId,
    deliveryMethod,
    endUserBpId,
    assignedPlantId,
    shippingWorkLocationId,
    customerOrderRef,
    quoteNumber,
    orderDate,
    notes,
    items,
  ]);
  // マウント時の値（＝保存済みの内容）。編集モードは開き直すと再マウント
  // されるので、これが常に「保存されている状態」になる。
  const [initialFingerprint] = useState(fingerprint);
  const isDirty = fingerprint !== initialFingerprint;

  const save = () => {
    if (deliveryMethod === "DIRECT_TO_USER" && !endUserBpId) {
      setEndUserError(tr("common.selectAnEndUserForDirect"));
      return;
    }
    startTransition(async () => {
      const result = await saveDraft(a.number, {
        customerBpId: customerId,
        salesRepId,
        shipToBpId,
        deliveryMethod,
        endUserBpId,
        assignedPlantId: assignedPlantId ? Number(assignedPlantId) : null,
        shippingWorkLocationId: shippingWorkLocationId
          ? Number(shippingWorkLocationId)
          : null,
        customerOrderRef: customerOrderRef || null,
        quoteNumber: quoteNumber || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items, priceContext, tr),
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("sales.orderAcceptanceDetail.orderAcceptanceWithNumber", {
            number: a.number,
          }),
          color: "green",
        });
        onClose();
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

  /** キャンセル — 変更があるときだけ確認する（design.md §16.2）。 */
  const cancel = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    modals.openConfirmModal({
      title: tr("sales.orderAcceptances.undoTheEdit"),
      children: (
        <Text size="sm">
          {tr("sales.orderAcceptances.unsavedChangesWillBeLostCancel")}
        </Text>
      ),
      labels: {
        confirm: tr("sales.orderAcceptances.discardChanges"),
        cancel: tr("sales.orderAcceptances.backToEditing"),
      },
      confirmProps: { color: "red" },
      onConfirm: onClose,
    });
  };

  return (
    <Stack gap="md">
      <IntakeReviewPanel review={a.review} />
      <FormSection
        description={tr(
          "sales.orderAcceptances.checkTheAiExtractionCorrectThe",
        )}
        title={tr("common.basicInformation")}
      >
        <Stack gap="sm">
          <Group gap="md">
            <Badge color={sourceDef.color} size="sm" variant="light">
              {sourceDef.label}
            </Badge>
          </Group>
          <Group align="flex-end" gap="sm" grow preventGrowOverflow={false}>
            <SearchSelect
              description={
                customerId
                  ? undefined
                  : tr(
                      "sales.orderAcceptances.customerNotIdentifiedRequiredToRequest",
                    )
              }
              f4={customerF4(tr)}
              initialOption={customerOption}
              label={tr("common.customer")}
              onChange={(v, option) => {
                setCustomerId(v);
                setCustomerOption(
                  v && option ? { value: v, label: option.label } : null,
                );
              }}
              onSearch={searchCustomerOptions}
              placeholder={tr("common.searchCustomers")}
              storageKey="customer"
              value={customerId}
              withAsterisk
            />
            <SalesRepSelect
              customerBpId={customerId}
              initial={
                a.salesRepId && a.salesRepName
                  ? { id: a.salesRepId, name: a.salesRepName }
                  : null
              }
              onChange={setSalesRepId}
              value={salesRepId}
            />
            <TextInput
              label={tr("common.customerOrderRef")}
              onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
              placeholder={tr("common.orderDocumentNumber")}
              value={customerOrderRef}
            />
            {/*
              見積書は手入力（QOT-… を書き写す）ではなく検索して選ぶ。
              顧客が決まっていればその顧客の見積だけに絞るので、
              別の顧客の見積を紐付けてしまう事故が起きない。
            */}
            <SearchSelect
              clearable
              initialOption={
                a.quoteNumber
                  ? { value: a.quoteNumber, label: a.quoteNumber }
                  : null
              }
              label={tr("common.quoteOptional")}
              onChange={(v) => setQuoteNumber(v ?? "")}
              onSearch={(q) => searchQuoteOptions(q, customerId)}
              placeholder={
                customerId
                  ? tr("common.searchQuotes")
                  : tr("common.chooseACustomerFirstToNarrow")
              }
              storageKey="quote"
              value={quoteNumber || null}
            />
            <DatePickerInput
              clearable
              label={tr("common.orderDate2")}
              leftSection={<IconCalendar size={14} />}
              onChange={setOrderDate}
              placeholder={tr("common.pickADate")}
              value={orderDate}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <Group align="flex-end" gap="sm" grow preventGrowOverflow={false}>
            {/* 出荷先は顧客と異なり得る（直送・支店渡しなど）— 任意。 */}
            <SearchSelect
              clearable
              initialOption={
                a.shipToBpId && a.shipToName
                  ? { value: a.shipToBpId, label: a.shipToName }
                  : null
              }
              label={
                <HelpLabel {...fieldHelp(tr, "orderAcceptance", "shipTo")} />
              }
              onChange={setShipToBpId}
              onSearch={searchShipToOptions}
              placeholder={tr("common.searchShipToOptional")}
              storageKey="ship-to"
              value={shipToBpId}
            />
            {/* 配送方法 — 出荷書は同じ出荷先×配送方法の明細だけを束ねられる。 */}
            <Select
              allowDeselect={false}
              data={acceptanceDeliveryMethodOptions(locale)}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "orderAcceptance", "deliveryMethod")}
                />
              }
              onChange={(v) => {
                setDeliveryMethod(
                  (v as "NORMAL" | "DIRECT_TO_USER") ?? "NORMAL",
                );
                if (v !== "DIRECT_TO_USER") setEndUserError(null);
              }}
              value={deliveryMethod}
              withAsterisk
            />
            {/* エンドユーザー — 直送では必須、通常配送でも記録用に任意で選べる。 */}
            <SearchSelect
              clearable
              error={endUserError}
              initialOption={
                a.endUserBpId && a.endUserName
                  ? { value: a.endUserBpId, label: a.endUserName }
                  : null
              }
              label={
                <HelpLabel {...fieldHelp(tr, "orderAcceptance", "endUser")} />
              }
              onChange={(v) => {
                setEndUserBpId(v);
                if (v) setEndUserError(null);
              }}
              onSearch={searchEndUserOptions}
              placeholder={
                deliveryMethod === "DIRECT_TO_USER"
                  ? tr("common.searchEndUsers")
                  : tr("common.searchEndUsersOptional")
              }
              storageKey="end-user"
              value={endUserBpId}
              withAsterisk={deliveryMethod === "DIRECT_TO_USER"}
            />
            <Select
              clearable
              data={plantOptions}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "orderAcceptance", "assignedPlant")}
                />
              }
              onChange={setAssignedPlantId}
              placeholder={tr("common.selectASiteOptional")}
              searchable
              value={assignedPlantId}
            />
            <Select
              clearable
              data={workLocationOptions}
              label={
                <HelpLabel
                  {...fieldHelp(tr, "orderAcceptance", "shippingWorkLocation")}
                />
              }
              onChange={setShippingWorkLocationId}
              placeholder={tr("common.selectAWorkLocationOptional")}
              searchable
              value={shippingWorkLocationId}
            />
          </Group>
          {/*
            突合が 1 件に絞れなかったときの候補。顧客が決まったら消える。
            打ち直させない — AI が読んだ社名とマスタの表記がずれているから
            こそ突合が外れており、そのずれた社名では検索しても出てこない。
          */}
          {!customerId && (
            <MatchSuggestions
              onPick={(s) => {
                setCustomerId(s.id);
                setCustomerOption({ value: s.id, label: s.label });
              }}
              suggestions={a.customerSuggestions}
            />
          )}
          <TextInput
            label={tr("common.notes")}
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder={tr("common.notesOptional")}
            value={notes}
          />
        </Stack>
      </FormSection>

      <FormSection
        description={tr("sales.orderAcceptances.matchRowsWithNoProductAgainst")}
        title={tr("common.lineItems")}
      >
        <OrderAcceptanceItemsEditor
          items={items}
          onChange={setItems}
          priceContext={priceContext}
        />
      </FormSection>

      <FormActions loading={isPending} onCancel={cancel} onSave={save} />
    </Stack>
  );
}
