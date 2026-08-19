"use client";

/**
 * OrderAcceptanceDetail — 注文請書 詳細 (SA24, design.md §8.2)。
 *
 * ライフサイクル: 取込（IMPORT）→ 下書き（DRAFT — インライン編集可）→
 * 承認依頼（REQUESTED）→ 承認（APPROVED）→ 確定（COMPLETED）→
 * アーカイブ（ARCHIVED）。
 *
 * - IMPORT: 抽出失敗は原因・対処つきの Alert + 再抽出 / 手入力へ切り替え
 *   （自動再試行の待機中は橙で「再試行中」）。処理中は案内 Alert。
 * - DRAFT: **閲覧 / 編集の 2 モード**。既定は閲覧（サマリ + 明細表 + 承認依頼）で、
 *   「編集」を押すと入力（基本情報 + 明細エディタ）に切り替わり、保存 /
 *   キャンセルで閲覧へ戻る。編集中は承認依頼を出さない（未保存の編集が
 *   消えるため）。
 * - REQUESTED: 承認 / 差し戻し（承認設定 MS0B のフローに従う — 代理可）。
 * - APPROVED: 確定（明細ごとに注文明細 ORD-…-NN を一括作成）。
 * - COMPLETED: 生成された注文明細リンク + アーカイブ。
 * 状態ごとの操作は最上部の ActionCard にまとめる（承認権限の有無で色が変わる
 * — 権限が無いユーザーにはグレーの「承認待ち」カード）。
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
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
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
} from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import {
  searchCustomerOptions,
  searchQuoteOptions,
} from "@/app/(dashboard)/_shared/option-search";
import {
  approveAcceptance,
  archiveAcceptance,
  confirmOrderLines,
  rejectAcceptance,
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
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { CUSTOMER_F4 } from "@/components/ui/f4-presets";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
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
import type { MemoView } from "@/lib/document-memos";
import { ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { parseExtractError } from "@/lib/intake-extract-error";
import {
  acceptanceReadiness,
  readinessSummary,
} from "@/lib/order-acceptance-readiness";
import type { ActionResult } from "@/lib/server-action";
import { IntakeDocumentPane } from "./IntakeDocumentPane";
import { IntakeReviewPanel } from "./IntakeReviewPanel";
import {
  INTAKE_SOURCE_BADGE,
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

const EMPTY_PRICE_CHECK: AcceptancePriceCheck = { lines: [], diffCount: 0 };

/**
 * 書類ライフサイクルの Stepper に出す「承認」段の説明。段数は承認設定 (MS0B)
 * が決めるので、進行中は「2/3 部門承認」、それ以外は担当グループ名を出す。
 */
function approvalStepDescription(approval: ApprovalActionState): string {
  if (approval.phase === "PENDING" && approval.stepCount > 1) {
    return `${approval.stepNo}/${approval.stepCount} ${approval.stepLabel}`;
  }
  return approval.groupLabel || "承認グループ";
}

export function OrderAcceptanceDetail({
  acceptance,
  auditEntries,
  attachments,
  memos,
  approvalTrail = [],
  approval,
  priceCheck = EMPTY_PRICE_CHECK,
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
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("attachments");
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
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

  const a = acceptance;
  const sourceDef = INTAKE_SOURCE_BADGE[a.source];

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

  // 承認依頼の可否 — 確定と同じ完成条件（サーバーの submitForApproval と
  // 同じ関数）。足りない項目があるうちはボタンを押せなくし、理由をカードに出す。
  const readiness = acceptanceReadiness({
    customerBpId: a.customerBpId,
    items: a.items,
  });

  // §2 価格照合（P0-8）— 差異行と明細 id → 照合結果の索引。
  const diffLines = priceCheck.lines.filter((l) => l.diff);
  const checkByItemId = new Map<string, AcceptancePriceCheckLine>(
    priceCheck.lines.map((l) => [l.itemId, l]),
  );

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `注文請書 ${a.number}`,
          color: "green",
        });
        setRejectOpen(false);
        setRejectReason("");
        setDeployOpen(false);
        setArchiveOpen(false);
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

  /** 確定 — 成功時は生成された注文明細番号を通知する。 */
  const deploy = () => {
    startTransition(async () => {
      const result = await confirmOrderLines(a.number);
      if (result.ok) {
        notifications.show({
          title: "確定しました",
          message: `注文明細 ${result.data.numbers.join(", ")} を作成しました`,
          color: "green",
        });
        setDeployOpen(false);
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

  /**
   * 承認依頼 — 価格差異があるときは確認モーダル（design.md §10.4）を挟み、
   * acknowledgePriceDiff: true で再実行する（サーバー側でも再照合される）。
   */
  const requestApproval = () => {
    if (diffLines.length === 0) {
      run(() => submitForApproval(a.number), "承認依頼しました");
      return;
    }
    modals.openConfirmModal({
      title: "価格差異の確認",
      children: (
        <Stack gap="xs">
          <Text size="sm">
            以下の明細は単価が価格表と一致しません。差異を確認のうえ承認依頼しますか？
          </Text>
          {diffLines.map((l) => (
            <Text key={l.itemId} size="sm">
              行{l.row}: {formatMoney(l.actual)} ≠ 価格表{" "}
              {formatMoney(l.expected)}
            </Text>
          ))}
        </Stack>
      ),
      labels: { confirm: "差異を確認して依頼", cancel: "戻る" },
      confirmProps: { color: "orange" },
      onConfirm: () =>
        run(() => submitForApproval(a.number, true), "承認依頼しました"),
    });
  };

  /**
   * 「いまやること」カード（最上部）。承認待ちは承認権限の有無で色が変わる
   * — 権限あり = 緑 + 承認/差し戻し、権限なし = グレーの「承認待ち」表示。
   */
  let actionCard: ReactNode = null;
  if (a.status === "DRAFT") {
    actionCard = editing ? (
      // 編集中は承認依頼を出さない — 押した瞬間に未保存の編集が消えるため。
      // 保存 / キャンセル（画面下に貼り付く FormActions）に集中させる。
      <ActionCard
        description="変更したら保存してください。保存すると閲覧に戻ります"
        icon={<IconPencil size={20} />}
        title="編集中"
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
            承認依頼
          </PrimaryButton>
        }
        description={
          readiness.ok
            ? "書類と見比べて、直すところがあれば「編集」で直してください"
            : `「編集」で直してください — ${readinessSummary(readiness.issues)}`
        }
        icon={<IconSend size={20} />}
        title={
          readiness.ok
            ? "内容を確認して承認依頼してください"
            : `承認依頼にはあと ${readiness.issues.length} 件の入力が必要です`
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
        subject={`注文請書 ${a.number}`}
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
            確定
          </PrimaryButton>
        }
        description="明細ごとに注文明細（ORD-…-NN）を一括作成します"
        icon={<IconTransform size={20} />}
        title="確定できます"
        tone="action"
      />
    );
  }
  // 確定後（COMPLETED）は ActionCard を出さない — 確定はゴールであって
  // 「次にやること」ではない。アーカイブは任意の片付け操作なので、
  // 急かさないよう ResourceActions のメニューにだけ置く。

  return (
    <DetailShell
      actions={
        <ResourceActions
          // 下書きの閲覧中だけ「編集」を出す（design.md §8.2 の定位置）。
          menuItems={
            a.status === "COMPLETED"
              ? [
                  {
                    label: "アーカイブ",
                    icon: <IconArchive size={14} />,
                    onClick: () => setArchiveOpen(true),
                  },
                ]
              : []
          }
          onEdit={
            a.status === "DRAFT" && !editing
              ? () => setEditing(true)
              : undefined
          }
        />
      }
      breadcrumbs={["販売", { label: "注文請書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(a.createdAt)}
      status={<StatusBadge entity="OrderAcceptanceIntake" status={a.status} />}
      title={a.number}
      updatedAt={formatDateTime(a.updatedAt)}
    >
      {/*
        書類は **状態に関わらず常に** 左に出す（取込中・失敗中でも見たい）。
        右は状態ごとの中身。狭い画面では縦積み（書類は折りたたみ）。
      */}
      {actionCard}

      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <IntakeDocumentPane
            filename={a.sourceFilename}
            fileUrl={fileUrl}
            mimeType={a.sourceMimeType}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
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
                          ? `自動再試行中（${failure.attempt}/${failure.maxAttempts} 回目が失敗）— まもなくもう一度実行します`
                          : `自動再試行 ${failure.attempt}/${failure.maxAttempts} 回とも失敗しました`}
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
                            "再抽出を受け付けました（順番に実行されます）",
                          )
                        }
                      >
                        再抽出
                      </SecondaryButton>
                      <SecondaryButton
                        leftSection={<IconPencil size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => takeOverManually(a.number),
                            "手入力に切り替えました",
                          )
                        }
                      >
                        手入力に切り替え
                      </SecondaryButton>
                    </Group>
                  </Stack>
                </Alert>
              ) : (
                <Alert
                  color="blue"
                  icon={<IconInfoCircle size={16} />}
                  title="抽出処理中"
                  variant="light"
                >
                  <Stack gap="xs">
                    <Text size="sm">
                      自動抽出の順番待ち・実行中です（1件あたり約1〜3分）。完了すると下書きになります。この画面を閉じても処理は続きます。
                    </Text>
                    <Group>
                      <SecondaryButton
                        leftSection={<IconPencil size={14} />}
                        loading={isPending}
                        onClick={() =>
                          run(
                            () => takeOverManually(a.number),
                            "手入力に切り替えました",
                          )
                        }
                      >
                        待たずに手入力する
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
                title={`価格差異 ${priceCheck.diffCount} 件`}
                variant="light"
              >
                <Stack gap={4}>
                  <Text size="sm">
                    明細の単価が価格表と一致しません。承認依頼には差異の確認が必要です。
                  </Text>
                  {diffLines.map((l) => (
                    <Text key={l.itemId} size="sm">
                      行{l.row}: {formatMoney(l.actual)} ≠ 価格表{" "}
                      {formatMoney(l.expected)}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            {a.status === "DRAFT" && editing ? (
              <DraftEditor
                acceptance={a}
                lineChecks={checkByItemId}
                onClose={() => setEditing(false)}
              />
            ) : (
              <>
                {/* 下書きの閲覧モードでも AI 突合の結果は出す（直す前に読む） */}
                {a.status === "DRAFT" && (
                  <IntakeReviewPanel review={a.review} />
                )}
                <SummaryGrid>
                  <FieldValue
                    label="番号"
                    value={<DocNumber>{a.number}</DocNumber>}
                  />
                  <FieldValue
                    label="取込元"
                    value={
                      <Badge color={sourceDef.color} size="sm" variant="light">
                        {sourceDef.label}
                      </Badge>
                    }
                  />
                  <FieldValue
                    label="取込元ファイル"
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
                    label="顧客"
                    value={
                      a.customerName ?? (
                        <Badge color="orange" size="sm" variant="light">
                          未特定
                        </Badge>
                      )
                    }
                  />
                  <FieldValue label="営業担当" value={a.salesRepName} />
                  <FieldValue
                    label="顧客注文書番号"
                    value={a.customerOrderRef}
                  />
                  <FieldValue
                    label="見積書"
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
                  <FieldValue label="注文日" value={formatDate(a.orderDate)} />
                  <FieldValue
                    label="明細数"
                    value={
                      <Text className="tabular-nums" size="sm" span>
                        {a.items.length} 件
                      </Text>
                    }
                  />
                  <FieldValue label="作成者" value={a.createdByName} />
                  <FieldValue
                    label="展開日時"
                    value={a.completedAt ? formatDateTime(a.completedAt) : "—"}
                  />
                  {/* 備考は 1 行まるごと使う — 3 列の枠だと読めない */}
                  <FieldValue fullWidth label="備考" value={a.notes} />
                </SummaryGrid>

                {/* 明細（読み取り専用） */}
                <Paper p="md" radius="md" withBorder>
                  <Title mb="sm" order={5}>
                    明細（{a.items.length}）
                  </Title>
                  <Table.ScrollContainer minWidth={760}>
                    <Table highlightOnHover striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>製品</Table.Th>
                          <Table.Th>品名（抽出）</Table.Th>
                          <Table.Th>種別</Table.Th>
                          <Table.Th ta="right">数量</Table.Th>
                          <Table.Th ta="right">単価</Table.Th>
                          <Table.Th ta="right">金額</Table.Th>
                          <Table.Th>納期</Table.Th>
                          <Table.Th>備考</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {a.items.map((it) => {
                          const lc = checkByItemId.get(it.id);
                          return (
                            <Table.Tr key={it.id}>
                              <Table.Td>
                                {it.productLabel ?? (
                                  <Badge
                                    color="orange"
                                    size="sm"
                                    variant="light"
                                  >
                                    製品未特定
                                  </Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                <Text c="dimmed" size="sm">
                                  {it.productText ?? "—"}
                                </Text>
                              </Table.Td>
                              <Table.Td>
                                {ORDER_TYPE_LABEL[it.orderType] ?? it.orderType}
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
                                      未入力
                                    </Text>
                                  )}
                                  {lc?.diff && (
                                    <Badge
                                      color="orange"
                                      size="xs"
                                      variant="light"
                                    >
                                      価格差異（価格表{" "}
                                      {formatMoney(lc.expected)}）
                                    </Badge>
                                  )}
                                  {lc?.unpriced && (
                                    <Badge
                                      color="gray"
                                      size="xs"
                                      variant="light"
                                    >
                                      価格表なし
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
                                {formatDate(it.deliveryDate)}
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
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
              </>
            )}

            {/* 承認・展開状況パネル */}
            <Paper p="md" radius="md" withBorder>
              <Title mb="md" order={5}>
                承認・展開状況
              </Title>

              <Stepper active={stepperActive(a.status)} size="sm">
                <Stepper.Step
                  description={sourceDef.label}
                  label="取込"
                  loading={a.status === "IMPORT"}
                />
                <Stepper.Step
                  description="内容確認・編集"
                  label="下書き"
                  loading={a.status === "DRAFT"}
                />
                <Stepper.Step
                  description={approvalStepDescription(approval)}
                  label="承認"
                  loading={a.status === "REQUESTED"}
                />
                <Stepper.Step
                  description={
                    a.completedAt ? formatDate(a.completedAt) : "注文明細へ"
                  }
                  label="確定"
                  loading={a.status === "APPROVED"}
                />
              </Stepper>

              {a.status === "ARCHIVED" && (
                <Text c="dimmed" mt="md" size="xs">
                  アーカイブ済み（{formatDateTime(a.archivedAt)}）
                </Text>
              )}

              {/* 確定で生成された注文明細 */}
              {a.orderLineNumbers.length > 0 && (
                <>
                  <Divider my="md" />
                  <Stack gap="xs">
                    <Text c="dimmed" fw={600} size="xs">
                      生成された注文明細
                    </Text>
                    <Group gap="sm">
                      {a.orderLineNumbers.map((n) => (
                        <Anchor
                          ff="mono"
                          href={`${SALES_ORDERS_PATH}/${n}`}
                          key={n}
                          size="sm"
                        >
                          {n}
                        </Anchor>
                      ))}
                    </Group>
                  </Stack>
                </>
              )}

              {countTrailRecords(approvalTrail) > 0 && (
                <>
                  <Divider my="md" />
                  <ApprovalTrailList trail={approvalTrail} />
                </>
              )}
            </Paper>

            <Tabs onChange={setTab} value={tab}>
              <Tabs.List>
                <Tabs.Tab value="attachments">
                  添付（{attachments.length}）
                </Tabs.Tab>
                <Tabs.Tab value="memo">メモ</Tabs.Tab>
                <Tabs.Tab value="history">履歴</Tabs.Tab>
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
            </Tabs>
          </Stack>
        </Grid.Col>
      </Grid>

      {/* 差し戻し（理由必須 → DRAFT へ戻す） */}
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
          run(() => rejectAcceptance(a.number, rejectReason), "差し戻しました");
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

      {/* 確定の確認 */}
      <ModalShell
        confirmLabel="展開する"
        loading={isPending}
        onClose={() => setDeployOpen(false)}
        onConfirm={deploy}
        opened={deployOpen}
        size="sm"
        title="確定の確認"
      >
        <Text size="sm">
          明細 {a.items.length} 件を注文明細（{a.number}-01〜-
          {String(a.items.length).padStart(2, "0")}）として一括作成します。
          全明細が製品特定済み・単価入力済みであることが必要です。
        </Text>
      </ModalShell>

      {/* アーカイブの確認 */}
      <ModalShell
        confirmLabel="アーカイブする"
        loading={isPending}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() =>
          run(() => archiveAcceptance(a.number), "アーカイブしました")
        }
        opened={archiveOpen}
        size="sm"
        title="アーカイブの確認"
      >
        <Text size="sm">
          注文請書 {a.number} をアーカイブします。以後の編集はできません。
        </Text>
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
  lineChecks,
  onClose,
}: {
  acceptance: OrderAcceptanceView;
  /** 保存済み明細 id → 価格照合結果（行バッジ表示用）。 */
  lineChecks: Map<string, AcceptancePriceCheckLine>;
  /** 閲覧モードへ戻す（保存成功 / キャンセル）。 */
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const a = acceptance;
  const sourceDef = INTAKE_SOURCE_BADGE[a.source];

  const [customerId, setCustomerId] = useState<string | null>(a.customerBpId);
  const [salesRepId, setSalesRepId] = useState<string | null>(a.salesRepId);
  const [customerOrderRef, setCustomerOrderRef] = useState(
    a.customerOrderRef ?? "",
  );
  const [quoteNumber, setQuoteNumber] = useState(a.quoteNumber ?? "");
  const [orderDate, setOrderDate] = useState<string | null>(a.orderDate);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [items, setItems] = useState<ItemRowForm[]>(() =>
    a.items.length > 0 ? toItemRows(a.items) : [newItemRow()],
  );

  /** 入力内容の指紋 — 変更の有無だけを見るので中身の意味は問わない。 */
  const fingerprint = JSON.stringify([
    customerId,
    salesRepId,
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
    startTransition(async () => {
      const result = await saveDraft(a.number, {
        customerBpId: customerId,
        salesRepId,
        customerOrderRef: customerOrderRef || null,
        quoteNumber: quoteNumber || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items),
      });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `注文請書 ${a.number}`,
          color: "green",
        });
        onClose();
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

  /** キャンセル — 変更があるときだけ確認する（design.md §16.2）。 */
  const cancel = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    modals.openConfirmModal({
      title: "編集の取り消し",
      children: (
        <Text size="sm">保存していない変更は失われます。取り消しますか？</Text>
      ),
      labels: { confirm: "変更を破棄", cancel: "編集に戻る" },
      confirmProps: { color: "red" },
      onConfirm: onClose,
    });
  };

  return (
    <Stack gap="md">
      <IntakeReviewPanel review={a.review} />
      <FormSection
        description="AI 抽出結果を確認し、顧客・明細を修正して保存します。"
        title="基本情報"
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
                customerId ? undefined : "顧客未特定 — 承認依頼には必須です"
              }
              f4={CUSTOMER_F4}
              initialOption={
                a.customerBpId && a.customerName
                  ? { value: a.customerBpId, label: a.customerName }
                  : null
              }
              label="顧客"
              onChange={(v) => setCustomerId(v)}
              onSearch={searchCustomerOptions}
              placeholder="顧客を検索"
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
              label="顧客注文書番号"
              onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
              placeholder="注文書の番号"
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
              label="見積書（任意）"
              onChange={(v) => setQuoteNumber(v ?? "")}
              onSearch={(q) => searchQuoteOptions(q, customerId)}
              placeholder={
                customerId ? "見積書を検索" : "先に顧客を選ぶと絞り込めます"
              }
              storageKey="quote"
              value={quoteNumber || null}
            />
            <DatePickerInput
              clearable
              label="注文日"
              leftSection={<IconCalendar size={14} />}
              onChange={setOrderDate}
              placeholder="日付を選択"
              value={orderDate}
              valueFormat="YYYY/MM/DD"
            />
          </Group>
          <TextInput
            label="備考"
            onChange={(e) => setNotes(e.currentTarget.value)}
            placeholder="備考（任意）"
            value={notes}
          />
        </Stack>
      </FormSection>

      <FormSection
        description="製品が未特定の行は製品マスタと突合してください（確定には全行の製品特定 + 単価が必要）。"
        title="明細"
      >
        <OrderAcceptanceItemsEditor
          items={items}
          lineChecks={Object.fromEntries(lineChecks)}
          onChange={setItems}
        />
      </FormSection>

      <FormActions loading={isPending} onCancel={cancel} onSave={save} />
    </Stack>
  );
}
