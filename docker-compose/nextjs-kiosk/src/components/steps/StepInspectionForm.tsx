"use client";

/**
 * StepInspectionForm.tsx — 検査記録の入力・表示（キオスク版 design.md §12.5）。
 *
 * nextjs-web の InspectionRecordForm と同じ業務規則（必須項目の実測値必須・
 * 全合格 = PASS / 1 つでも不合格 = FAIL）。タブレット向けにテーブルではなく
 * 項目ごとの縦積みカードで出す（横スクロールを作らない）。
 * 検査承認はキオスクに持たない — 記録のみ。
 */

import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  InspectionRecordView,
  InspectionTemplateItemView,
  InspectionTemplateView,
} from "@/lib/step-records";
import { missingRequiredItems } from "@/lib/steps-core";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

/** 許容値の表示（min〜max + 単位）。 */
function toleranceRange(item: InspectionTemplateItemView): string | null {
  if (item.toleranceMin == null && item.toleranceMax == null) return null;
  const unit = item.unit ? ` ${item.unit}` : "";
  return `${item.toleranceMin ?? ""}〜${item.toleranceMax ?? ""}${unit}`;
}

function statusColor(status: string): string {
  switch (status) {
    case "PASS":
      return "green";
    case "FAIL":
      return "red";
    case "APPROVED":
      return "teal";
    default:
      return "gray";
  }
}

/** 既存の検査記録 1 件の読み取り専用表示。 */
function RecordSummary({ record }: { record: InspectionRecordView }) {
  const { m, locale } = useI18n();
  const statusTable = m.steps.inspection.status as Record<string, string>;
  const at = record.recordedAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(record.recordedAt))
    : "";
  return (
    <Paper p="sm" radius="sm" withBorder>
      <Group gap="sm" wrap="wrap">
        <Text fw={600} size="sm">
          {record.templateName}
        </Text>
        <Badge color={statusColor(record.status)} size="md" variant="light">
          {statusTable[record.status] ?? record.status}
        </Badge>
        <Text c="dimmed" size="xs">
          {m.steps.inspection.recordedMeta(at, record.recordedByName ?? "")}
        </Text>
      </Group>
      {record.items.length > 0 && (
        <Group gap="xs" mt="xs" wrap="wrap">
          {record.items.map((it) => (
            <Badge
              color={it.isPass === false ? "red" : "green"}
              key={`${record.id}:${it.itemName}`}
              size="md"
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

interface ItemEntry {
  measuredValue: string;
  isPass: "PASS" | "FAIL";
}

type Props = {
  stepId: string;
  templates: InspectionTemplateView[];
  records: InspectionRecordView[];
  /** 作業中 / 一時停止中のみ true（完了・他人セッションでは読み取り専用）。 */
  canRecord: boolean;
};

export function StepInspectionForm({
  stepId,
  templates,
  records,
  canRecord,
}: Props) {
  const router = useRouter();
  const { m } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);
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
      [`${templateId}:${itemId}`]: { ...entryOf(templateId, itemId), ...patch },
    }));

  const save = async (template: InspectionTemplateView) => {
    setError(null);
    setSavedTemplate(null);
    const values: Record<number, string> = {};
    for (const it of template.items) {
      values[it.id] = entryOf(template.id, it.id).measuredValue;
    }
    if (missingRequiredItems(template.items, values).length > 0) {
      setError(m.steps.inspection.requiredMissing);
      return;
    }
    setBusy(true);
    const res = await callStepAction(stepId, {
      action: "INSPECTION",
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
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      return;
    }
    // 入力をクリアして記録一覧を出し直す
    setEntries((prev) => {
      const next = { ...prev };
      for (const it of template.items) delete next[`${template.id}:${it.id}`];
      return next;
    });
    setSavedTemplate(template.name);
    router.refresh();
  };

  if (templates.length === 0 && records.length === 0) return null;

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{m.steps.inspection.title}</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <RecordSummary key={r.id} record={r} />
            ))}
          </Stack>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}
        {savedTemplate && (
          <Alert color="green" icon={<IconCheck size={20} />}>
            {m.steps.inspection.saved}
          </Alert>
        )}

        {canRecord && templates.length === 0 && (
          <Text c="dimmed" size="sm">
            {m.steps.inspection.noTemplates}
          </Text>
        )}

        {canRecord &&
          templates.map((template) => (
            <Stack gap="sm" key={template.id}>
              <Title order={5}>{template.name}</Title>
              {template.items.map((item) => {
                const entry = entryOf(template.id, item.id);
                const range = toleranceRange(item);
                return (
                  <Paper key={item.id} p="sm" radius="sm" withBorder>
                    <Stack gap="xs">
                      <Group gap="xs" wrap="wrap">
                        <Text fw={600}>{item.name}</Text>
                        {item.isRequired && (
                          <Badge color="red" size="sm" variant="light">
                            {m.steps.inspection.required}
                          </Badge>
                        )}
                        {range && (
                          <Text c="dimmed" size="sm">
                            {m.steps.inspection.tolerance(range)}
                          </Text>
                        )}
                      </Group>
                      <Group align="flex-end" gap="sm" wrap="nowrap">
                        <TextInput
                          aria-label={`${item.name} — ${m.steps.inspection.measured}`}
                          onChange={(e) =>
                            setEntry(template.id, item.id, {
                              measuredValue: e.currentTarget.value,
                            })
                          }
                          placeholder={m.steps.inspection.measured}
                          style={{ flex: 1 }}
                          value={entry.measuredValue}
                        />
                        <SegmentedControl
                          color={entry.isPass === "PASS" ? "green" : "red"}
                          data={[
                            { value: "PASS", label: m.steps.inspection.pass },
                            { value: "FAIL", label: m.steps.inspection.fail },
                          ]}
                          onChange={(v) =>
                            setEntry(template.id, item.id, {
                              isPass: v as "PASS" | "FAIL",
                            })
                          }
                          size="lg"
                          value={entry.isPass}
                        />
                      </Group>
                    </Stack>
                  </Paper>
                );
              })}
              <Button fullWidth loading={busy} onClick={() => save(template)}>
                {m.steps.inspection.save}
              </Button>
            </Stack>
          ))}
      </Stack>
    </Paper>
  );
}
