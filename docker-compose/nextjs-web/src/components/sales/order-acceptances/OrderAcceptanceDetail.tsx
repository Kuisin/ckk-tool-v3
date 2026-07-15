"use client";

/**
 * OrderAcceptanceDetail — 受注請書 詳細 (SA23, design.md §8.2)。
 *
 * ライフサイクル: 取込（IMPORT）→ 下書き（DRAFT — インライン編集可）→
 * 承認依頼（REQUESTED）→ 承認（APPROVED）→ 伝票展開（COMPLETED）→
 * アーカイブ（ARCHIVED）。
 *
 * - IMPORT: 抽出失敗は赤 Alert + 再抽出。処理中は案内 Alert。
 * - DRAFT: 基本情報（顧客 SearchSelect）+ 明細エディタ + 保存 / 承認依頼。
 * - REQUESTED: 承認 / 差し戻し（第一承認グループ — 代理可）。
 * - APPROVED: 伝票展開（明細ごとに注文請書 ORD-…-NN を一括作成）。
 * - COMPLETED: 生成された注文請書リンク + アーカイブ。
 * タブ: 添付（AttachmentsPanel）/ 履歴（HistoryPanel）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Divider,
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
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArchive,
  IconCalendar,
  IconFile,
  IconInfoCircle,
  IconRefresh,
  IconSend,
  IconTransform,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchCustomerOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  approveAcceptance,
  archiveAcceptance,
  deployToSalesOrders,
  rejectAcceptance,
  retryExtraction,
  saveDraft,
  submitForApproval,
} from "@/app/(dashboard)/sales/order-acceptances/actions";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/production/ApprovalStatusPanel";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { CUSTOMER_F4 } from "@/components/ui/f4-presets";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { MoneyText } from "@/components/ui/MoneyText";
import { ModalShell } from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  FormSection,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { useTabParam } from "@/hooks/useUrlState";
import { ORDER_TYPE_LABEL } from "@/lib/enum-labels";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
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
const SALES_ORDERS_PATH = "/production/sales-orders";

/** status → Stepper の active index（取込 / 下書き / 承認 / 伝票展開）。 */
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

export function OrderAcceptanceDetail({
  acceptance,
  auditEntries,
  attachments,
  approvalTrail = [],
  canApprove,
}: {
  acceptance: OrderAcceptanceView;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
  /** 添付（document_attachments 由来、添付タブ）。 */
  attachments: AttachmentView[];
  /** 正規化された承認記録（approval_records — 代理承認マーカー付き）。 */
  approvalTrail?: ApprovalTrailView[];
  /** 第一承認グループのメンバー（or 代理）か。 */
  canApprove: boolean;
}) {
  const router = useRouter();
  // アクティブタブを ?tab= に保持（URL 共有でタブまで再現）
  const [tab, setTab] = useTabParam("attachments");
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const a = acceptance;
  const sourceDef = INTAKE_SOURCE_BADGE[a.source];
  const fileUrl = a.sourceFilename ? sourceFileUrl(a) : null;

  const run = (action: () => Promise<ActionResult>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({
          title: done,
          message: `受注請書 ${a.number}`,
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

  /** 伝票展開 — 成功時は生成された注文請書番号を通知する。 */
  const deploy = () => {
    startTransition(async () => {
      const result = await deployToSalesOrders(a.number);
      if (result.ok) {
        notifications.show({
          title: "伝票展開しました",
          message: `注文請書 ${result.data.numbers.join(", ")} を作成しました`,
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

  return (
    <DetailShell
      actions={
        <ResourceActions
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
        />
      }
      breadcrumbs={["販売", { label: "受注請書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(a.createdAt)}
      status={<StatusBadge entity="OrderAcceptanceIntake" status={a.status} />}
      title={a.number}
      updatedAt={formatDateTime(a.updatedAt)}
    >
      {/* 取込中 / 抽出失敗（IMPORT） */}
      {a.status === "IMPORT" &&
        (a.extractError ? (
          <Alert
            color="red"
            icon={<IconAlertTriangle size={16} />}
            title="自動抽出に失敗しました"
            variant="light"
          >
            <Stack gap="xs">
              <Text size="sm">{a.extractError}</Text>
              <Group>
                <SecondaryButton
                  leftSection={<IconRefresh size={14} />}
                  loading={isPending}
                  onClick={() =>
                    run(() => retryExtraction(a.number), "再抽出しました")
                  }
                >
                  再抽出
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
            自動抽出を実行中です（1件あたり約30〜60秒）。完了すると下書きになります。
          </Alert>
        ))}

      {a.status === "DRAFT" ? (
        <DraftEditor acceptance={a} fileUrl={fileUrl} />
      ) : (
        <>
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
            <FieldValue label="顧客注文書番号" value={a.customerOrderRef} />
            <FieldValue label="注文日" value={formatDate(a.orderDate)} />
            <FieldValue
              label="明細数"
              value={
                <Text className="tabular-nums" size="sm" span>
                  {a.items.length} 件
                </Text>
              }
            />
            <FieldValue
              label="展開日時"
              value={a.completedAt ? formatDateTime(a.completedAt) : "—"}
            />
            <FieldValue label="備考" value={a.notes} />
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
                  {a.items.map((it) => (
                    <Table.Tr key={it.id}>
                      <Table.Td>
                        {it.productLabel ?? (
                          <Badge color="orange" size="sm" variant="light">
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
                        {it.unitPrice != null ? (
                          <MoneyText value={it.unitPrice} />
                        ) : (
                          <Text c="dimmed" size="sm">
                            未入力
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {it.unitPrice != null ? (
                          <MoneyText value={it.unitPrice * it.quantity} />
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
                  ))}
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
            description="第一承認グループ"
            label="承認"
            loading={a.status === "REQUESTED"}
          />
          <Stepper.Step
            description={
              a.completedAt ? formatDate(a.completedAt) : "注文請書へ"
            }
            label="伝票展開"
            loading={a.status === "APPROVED"}
          />
        </Stepper>

        <Group gap="xs" mt="md">
          {a.status === "DRAFT" && (
            <>
              <PrimaryButton
                leftSection={<IconSend size={14} />}
                loading={isPending}
                onClick={() =>
                  run(() => submitForApproval(a.number), "承認依頼しました")
                }
              >
                承認依頼
              </PrimaryButton>
              <Text c="dimmed" size="xs">
                未保存の編集は承認依頼の前に保存してください
              </Text>
            </>
          )}
          {a.status === "REQUESTED" &&
            (canApprove ? (
              <>
                <ApproveButton
                  loading={isPending}
                  onClick={() =>
                    run(() => approveAcceptance(a.number), "承認しました")
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
          {a.status === "APPROVED" && (
            <PrimaryButton
              leftSection={<IconTransform size={14} />}
              loading={isPending}
              onClick={() => setDeployOpen(true)}
            >
              伝票展開
            </PrimaryButton>
          )}
          {a.status === "COMPLETED" && (
            <SecondaryButton
              leftSection={<IconArchive size={14} />}
              loading={isPending}
              onClick={() => setArchiveOpen(true)}
            >
              アーカイブ
            </SecondaryButton>
          )}
          {a.status === "ARCHIVED" && (
            <Text c="dimmed" size="xs">
              アーカイブ済み（{formatDateTime(a.archivedAt)}）
            </Text>
          )}
        </Group>

        {/* 伝票展開で生成された注文請書 */}
        {a.salesOrderNumbers.length > 0 && (
          <>
            <Divider my="md" />
            <Stack gap="xs">
              <Text c="dimmed" fw={600} size="xs">
                生成された注文請書
              </Text>
              <Group gap="sm">
                {a.salesOrderNumbers.map((n) => (
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
          <Tabs.Tab value="attachments">添付（{attachments.length}）</Tabs.Tab>
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

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

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

      {/* 伝票展開の確認 */}
      <ModalShell
        confirmLabel="展開する"
        loading={isPending}
        onClose={() => setDeployOpen(false)}
        onConfirm={deploy}
        opened={deployOpen}
        size="sm"
        title="伝票展開の確認"
      >
        <Text size="sm">
          明細 {a.items.length} 件を注文請書（{a.number}-01〜-
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
          受注請書 {a.number} をアーカイブします。以後の編集はできません。
        </Text>
      </ModalShell>
    </DetailShell>
  );
}

/**
 * DraftEditor — DRAFT のインライン編集（基本情報 + 明細 + 保存）。
 * DRAFT のときだけマウントされるため、初期値は props から安全に取れる。
 */
function DraftEditor({
  acceptance,
  fileUrl,
}: {
  acceptance: OrderAcceptanceView;
  fileUrl: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const a = acceptance;
  const sourceDef = INTAKE_SOURCE_BADGE[a.source];

  const [customerId, setCustomerId] = useState<string | null>(a.customerBpId);
  const [customerOrderRef, setCustomerOrderRef] = useState(
    a.customerOrderRef ?? "",
  );
  const [orderDate, setOrderDate] = useState<string | null>(a.orderDate);
  const [notes, setNotes] = useState(a.notes ?? "");
  const [items, setItems] = useState<ItemRowForm[]>(() =>
    a.items.length > 0 ? toItemRows(a.items) : [newItemRow()],
  );

  const save = () => {
    startTransition(async () => {
      const result = await saveDraft(a.number, {
        customerBpId: customerId,
        customerOrderRef: customerOrderRef || null,
        orderDate,
        notes: notes || null,
        items: toItemPayload(items),
      });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `受注請書 ${a.number}`,
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
  };

  return (
    <>
      <FormSection
        description="AI 抽出結果を確認し、顧客・明細を修正して保存します。"
        title="基本情報"
      >
        <Stack gap="sm">
          <Group gap="md">
            <Badge color={sourceDef.color} size="sm" variant="light">
              {sourceDef.label}
            </Badge>
            {fileUrl && (
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
            )}
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
            <TextInput
              label="顧客注文書番号"
              onChange={(e) => setCustomerOrderRef(e.currentTarget.value)}
              placeholder="注文書の番号"
              value={customerOrderRef}
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
        description="製品が未特定の行は製品マスタと突合してください（伝票展開には全行の製品特定 + 単価が必要）。"
        title="明細"
      >
        <OrderAcceptanceItemsEditor items={items} onChange={setItems} />
      </FormSection>

      <Group justify="flex-end">
        <SaveButton loading={isPending} onClick={save} type="button" />
      </Group>
    </>
  );
}
