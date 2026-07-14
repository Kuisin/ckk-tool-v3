"use client";

/**
 * InspectionRecordForm — 検査記録の入力・表示 (design.md §12.5)。
 *
 * タブレット最優先（size="lg"、§20.1）。指示書に紐付く検査表テンプレート
 * ごとに 検査項目 / 許容値 / 実測値 / 合否（SegmentedControl 合格・不合格）の
 * 表を出し、保存で InspectionRecord（全合格 = PASS / それ以外 = FAIL）+
 * 項目を作成する。既存記録は読み取り専用で一覧表示。
 *
 * InspectionApprovalPanel — 検査承認工程用: 指示書全体の検査記録を一覧し、
 * PASS の記録を「承認」（APPROVED + approvedBy/At）する。
 */

import {
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveInspectionRecord,
  saveInspectionRecord,
} from "@/app/(dashboard)/production/work-orders/[id]/steps/[stepId]/actions";
import { ApproveButton, PrimaryButton } from "@/components/ui/buttons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDateTime } from "@/lib/format";
import type {
  InspectionRecordView,
  InspectionTemplateItemView,
  InspectionTemplateView,
} from "./step-execution/model";

/** 許容値の表示（min〜max + 単位）。 */
function toleranceLabel(item: InspectionTemplateItemView): string {
  if (item.toleranceMin == null && item.toleranceMax == null) return "—";
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${item.toleranceMin ?? ""}〜${item.toleranceMax ?? ""}${unit}`;
}

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({ record }: { record: InspectionRecordView }) {
  return (
    <Paper p="sm" radius="sm" withBorder>
      <Group gap="sm" wrap="wrap">
        {record.stepName && (
          <Text fw={600} size="sm">
            {record.stepName}
          </Text>
        )}
        <Text size="sm">{record.templateName}</Text>
        <StatusBadge entity="InspectionRecord" status={record.status} />
        <Text c="dimmed" size="xs">
          記録: {formatDateTime(record.recordedAt)}
          {record.recordedByName ? `（${record.recordedByName}）` : ""}
        </Text>
        {record.approvedAt && (
          <Text c="dimmed" size="xs">
            承認: {formatDateTime(record.approvedAt)}
            {record.approvedByName ? `（${record.approvedByName}）` : ""}
          </Text>
        )}
      </Group>
      {record.items.length > 0 && (
        <Group gap="sm" mt="xs" wrap="wrap">
          {record.items.map((it) => (
            <Badge
              color={it.isPass === false ? "red" : "green"}
              key={it.templateItemId}
              size="sm"
              variant="light"
            >
              {it.itemName}: {it.measuredValue ?? "—"}
            </Badge>
          ))}
        </Group>
      )}
    </Paper>
  );
}

// ── 記録モード（検査工程） ───────────────────────────────────────────────────

interface ItemEntry {
  measuredValue: string;
  isPass: "PASS" | "FAIL";
}

export function InspectionRecordForm({
  workOrderNumber,
  stepId,
  templates,
  records,
  canRecord,
}: {
  workOrderNumber: number;
  stepId: string;
  templates: InspectionTemplateView[];
  /** この工程の既存記録。 */
  records: InspectionRecordView[];
  /** 進行中 & セッション保有時のみ true。 */
  canRecord: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // key = `${templateId}:${itemId}`
  const [entries, setEntries] = useState<Record<string, ItemEntry>>({});

  const entryOf = (templateId: number, itemId: number): ItemEntry =>
    entries[`${templateId}:${itemId}`] ?? { measuredValue: "", isPass: "PASS" };

  const setEntry = (
    templateId: number,
    itemId: number,
    patch: Partial<ItemEntry>,
  ) =>
    setEntries((prev) => ({
      ...prev,
      [`${templateId}:${itemId}`]: {
        ...entryOf(templateId, itemId),
        ...patch,
      },
    }));

  const handleSave = (template: InspectionTemplateView) => {
    const missing = template.items.filter(
      (it) =>
        it.isRequired && !entryOf(template.id, it.id).measuredValue.trim(),
    );
    if (missing.length > 0) {
      notifications.show({
        title: "入力不足",
        message: `必須項目の実測値を入力してください（${missing
          .map((m) => m.name)
          .join("・")}）`,
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await saveInspectionRecord({
        workOrderNumber,
        stepId,
        templateId: template.id,
        items: template.items.map((it) => {
          const e = entryOf(template.id, it.id);
          return {
            templateItemId: it.id,
            measuredValue: e.measuredValue,
            isPass: e.isPass === "PASS",
          };
        }),
      });
      if (result.ok) {
        notifications.show({
          title: "検査記録を保存しました",
          message: template.name,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "検査記録の保存に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>検査記録</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <RecordSummary key={r.id} record={r} />
            ))}
          </Stack>
        )}

        {canRecord &&
          templates.map((template) => (
            <Stack gap="sm" key={template.id}>
              <Title order={5}>{template.name}</Title>
              <Table.ScrollContainer minWidth={560}>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>検査項目</Table.Th>
                      <Table.Th>許容値</Table.Th>
                      <Table.Th>実測値</Table.Th>
                      <Table.Th>合否</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {template.items.map((item) => {
                      const entry = entryOf(template.id, item.id);
                      return (
                        <Table.Tr key={item.id}>
                          <Table.Td>
                            <Text size="sm">
                              {item.name}
                              {item.isRequired && (
                                <Text c="red" component="span" size="sm">
                                  {" *"}
                                </Text>
                              )}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text c="dimmed" size="sm">
                              {toleranceLabel(item)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              aria-label={`${item.name} の実測値`}
                              onChange={(e) =>
                                setEntry(template.id, item.id, {
                                  measuredValue: e.currentTarget.value,
                                })
                              }
                              placeholder="実測値"
                              size="lg"
                              value={entry.measuredValue}
                            />
                          </Table.Td>
                          <Table.Td>
                            <SegmentedControl
                              data={[
                                { value: "PASS", label: "合格" },
                                { value: "FAIL", label: "不合格" },
                              ]}
                              onChange={(v) =>
                                setEntry(template.id, item.id, {
                                  isPass: v as "PASS" | "FAIL",
                                })
                              }
                              size="lg"
                              value={entry.isPass}
                            />
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
              <Group justify="flex-end">
                <PrimaryButton
                  loading={isPending}
                  onClick={() => handleSave(template)}
                  size="lg"
                >
                  検査記録を保存
                </PrimaryButton>
              </Group>
            </Stack>
          ))}

        {!canRecord && records.length === 0 && (
          <Text c="dimmed" size="sm">
            検査記録はありません
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

// ── 承認モード（検査承認工程） ───────────────────────────────────────────────

export function InspectionApprovalPanel({
  workOrderNumber,
  stepId,
  records,
  canApprove,
}: {
  workOrderNumber: number;
  stepId: string;
  /** 指示書全体の検査記録（stepName 付き）。 */
  records: InspectionRecordView[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleApprove = (record: InspectionRecordView) => {
    startTransition(async () => {
      const result = await approveInspectionRecord(
        workOrderNumber,
        stepId,
        record.id,
      );
      if (result.ok) {
        notifications.show({
          title: "検査記録を承認しました",
          message: record.templateName,
          color: "green",
        });
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: result.errors?.join(" / ") ?? "検査記録の承認に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Paper p="lg" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>検査承認</Title>
        {records.length === 0 ? (
          <Text c="dimmed" size="sm">
            承認対象の検査記録がありません（先に検査工程で記録してください）
          </Text>
        ) : (
          <Stack gap="xs">
            {records.map((r) => (
              <Group align="stretch" gap="sm" key={r.id} wrap="nowrap">
                <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                  <RecordSummary record={r} />
                </Stack>
                {canApprove && r.status === "PASS" && (
                  <ApproveButton
                    loading={isPending}
                    onClick={() => handleApprove(r)}
                    size="lg"
                  />
                )}
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
