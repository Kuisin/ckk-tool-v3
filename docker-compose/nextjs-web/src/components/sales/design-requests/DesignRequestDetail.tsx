"use client";

/**
 * DesignRequestDetail — 設計依頼書 詳細 (SA24, design.md §8.2).
 *
 * SummaryGrid（依頼番号 / トリガー / 見積書 or 注文請書リンク / 製品 / 状態 /
 * 完了日）+ Tabs: 概要（依頼内容）/ ファイル（バージョン一覧 — アップロードは
 * 準備中）/ 履歴（HistoryPanel）。
 *
 * Actions: 編集（未着手・進行中のみ）/ 着手（PENDING → IN_PROGRESS）/
 * 完了（IN_PROGRESS → COMPLETED, 確認モーダル）/ 差し戻し（COMPLETED →
 * IN_PROGRESS, 確認モーダル）。遷移ガードはサーバー側でも原子的に実施。
 */

import { Anchor, Badge, Group, Stack, Table, Tabs, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconCheck,
  IconFile,
  IconPlayerPlay,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  completeDesign,
  reopenDesign,
  startDesign,
} from "@/app/(dashboard)/sales/design-requests/actions";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import { EmptyState } from "@/components/ui/EmptyState";
import { FieldValue } from "@/components/ui/FieldValue";
import { HistoryPanel } from "@/components/ui/HistoryPanel";
import { ConfirmModal } from "@/components/ui/modals";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  DetailShell,
  ResourceActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { DESIGN_TRIGGER_LABEL } from "@/lib/enum-labels";
import { formatDateTime } from "@/lib/format";
import type { ActionResult } from "@/lib/server-action";
import { DESIGN_TRIGGER_COLOR, type DesignRequest, isEditable } from "./model";

const BASE_PATH = "/sales/design-requests";

export function DesignRequestDetail({
  request,
  auditEntries,
}: {
  request: DesignRequest;
  /** 操作履歴（audit_logs 由来、履歴タブ）。 */
  auditEntries: AuditEntry[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);

  const editable = isEditable(request);

  /** 状態遷移アクションの共通実行（成功トースト + refresh）。 */
  const runTransition = (
    action: (number: string) => Promise<ActionResult>,
    successMessage: string,
  ) => {
    startTransition(async () => {
      const result = await action(request.requestNumber);
      if (result.ok) {
        notifications.show({
          title: successMessage,
          message: `設計依頼書 ${request.requestNumber}`,
          color: "green",
        });
        setCompleteOpen(false);
        setReopenOpen(false);
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
        <Group gap="xs" wrap="nowrap">
          {/* 着手 — 未着手のときのみ（確認不要の前進操作）。 */}
          {request.status === "PENDING" && (
            <PrimaryButton
              leftSection={<IconPlayerPlay size={14} />}
              loading={isPending}
              onClick={() => runTransition(startDesign, "着手しました")}
            >
              着手
            </PrimaryButton>
          )}
          <ResourceActions
            menuItems={[
              ...(request.status === "IN_PROGRESS"
                ? [
                    {
                      label: "完了",
                      icon: <IconCheck size={14} />,
                      onClick: () => setCompleteOpen(true),
                    },
                  ]
                : []),
              ...(request.status === "COMPLETED"
                ? [
                    {
                      label: "差し戻し",
                      icon: <IconArrowBackUp size={14} />,
                      color: "red",
                      onClick: () => setReopenOpen(true),
                    },
                  ]
                : []),
            ]}
            onEdit={
              editable
                ? () => router.push(`${BASE_PATH}/${request.id}/edit`)
                : undefined
            }
          />
        </Group>
      }
      breadcrumbs={["販売", { label: "設計依頼書", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(request.createdAt)}
      status={<StatusBadge entity="DesignRequest" status={request.status} />}
      title={request.requestNumber}
      updatedAt={formatDateTime(request.updatedAt)}
    >
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
        {request.trigger === "QUOTE" ? (
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
            label="注文請書"
            value={
              request.salesOrderNumber ? (
                <Anchor
                  onClick={() =>
                    router.push(
                      `/production/sales-orders/${request.salesOrderNumber}`,
                    )
                  }
                  size="sm"
                >
                  <DocNumber c="blue">{request.salesOrderNumber}</DocNumber>
                </Anchor>
              ) : (
                "—"
              )
            }
          />
        )}
        <FieldValue label="製品" value={request.productName ?? "—"} />
        <FieldValue
          label="状態"
          value={<StatusBadge entity="DesignRequest" status={request.status} />}
        />
        <FieldValue
          label="完了日"
          value={
            request.completedAt ? formatDateTime(request.completedAt) : "—"
          }
        />
      </SummaryGrid>

      <Tabs defaultValue="overview">
        <Tabs.List>
          <Tabs.Tab value="overview">概要</Tabs.Tab>
          <Tabs.Tab value="files">ファイル（{request.files.length}）</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel pt="md" value="overview">
          <Stack gap="md">
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

        {/* 設計ファイル — バージョン一覧のみ（アップロード UI は準備中）。 */}
        <Tabs.Panel pt="md" value="files">
          {request.files.length === 0 ? (
            <EmptyState
              icon={<IconFile size={24} />}
              message="設計ファイルのアップロードは準備中です"
            />
          ) : (
            <Table.ScrollContainer minWidth={640}>
              <Table highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th ta="right" w={90}>
                      バージョン
                    </Table.Th>
                    <Table.Th>ファイル名</Table.Th>
                    <Table.Th>備考</Table.Th>
                    <Table.Th w={150}>登録日時</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {request.files.map((f) => (
                    <Table.Tr key={f.id}>
                      <Table.Td className="tabular-nums" ta="right">
                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                          v{f.version}
                          {f.isLatest && (
                            <Badge color="green" variant="light">
                              最新
                            </Badge>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{f.filename}</Text>
                        <Text c="dimmed" size="xs">
                          {f.mimeType}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text c={f.notes ? undefined : "dimmed"} size="sm">
                          {f.notes || "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td className="tabular-nums">
                        {formatDateTime(f.createdAt)}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Tabs.Panel>

        <Tabs.Panel pt="md" value="history">
          <HistoryPanel entries={auditEntries} />
        </Tabs.Panel>
      </Tabs>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel="完了"
        loading={isPending}
        message={`設計依頼書 ${request.requestNumber} を完了します。完了日時が記録されます。`}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => runTransition(completeDesign, "完了しました")}
        opened={completeOpen}
        title="完了の確認"
      />
      <ConfirmModal
        confirmLabel="差し戻す"
        loading={isPending}
        message={`設計依頼書 ${request.requestNumber} を進行中へ差し戻します。完了日時はクリアされます。`}
        onClose={() => setReopenOpen(false)}
        onConfirm={() => runTransition(reopenDesign, "差し戻しました")}
        opened={reopenOpen}
        title="差し戻しの確認"
      />
    </DetailShell>
  );
}
