"use client";

/**
 * StepDefectForm.tsx — 不良記録の入力・表示（キオスク版 design.md §12.6）。
 *
 * nextjs-web の DefectRecordForm と同じ規則: 種類 + 内容（必須）を複数行
 * まとめて追加。既存記録は読み取り専用で一覧表示。任意記録なので
 * 既定は閉じたボタンだけ出し、タップでフォームを開く。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DefectRecordView, DefectTypeView } from "@/lib/step-records";
import { type DefectEntry, isDefectEntryComplete } from "@/lib/steps-core";
import { useI18n } from "../I18nProvider";
import { callStepAction, translateError } from "./step-ui";

type Props = {
  stepId: string;
  defectTypes: DefectTypeView[];
  records: DefectRecordView[];
  /** 作業中 / 一時停止中のみ true。 */
  canRecord: boolean;
};

const EMPTY: DefectEntry = { defectTypeId: null, description: "" };

export function StepDefectForm({
  stepId,
  defectTypes,
  records,
  canRecord,
}: Props) {
  const router = useRouter();
  const { m, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<DefectEntry[]>([EMPTY]);

  const setRow = (index: number, patch: Partial<DefectEntry>) =>
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );

  const complete = rows.filter(isDefectEntryComplete);

  const save = async () => {
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await callStepAction(stepId, {
      action: "DEFECTS",
      defects: complete.map((r) => ({
        // isDefectEntryComplete で null を除外済み
        defectTypeId: r.defectTypeId as number,
        description: r.description.trim(),
      })),
    });
    setBusy(false);
    if (!res.ok) {
      setError(translateError(m, res));
      return;
    }
    setRows([EMPTY]);
    setOpen(false);
    setSaved(true);
    router.refresh();
  };

  const formatAt = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));

  if (!canRecord && records.length === 0) return null;

  return (
    <Paper p="md" radius="md" withBorder>
      <Stack gap="md">
        <Title order={4}>{m.steps.defects.title}</Title>

        {records.length > 0 && (
          <Stack gap="xs">
            {records.map((r) => (
              <Paper key={r.id} p="sm" radius="sm" withBorder>
                <Group gap="sm" wrap="wrap">
                  <Badge color="red" size="md" variant="light">
                    {r.defectTypeName}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {formatAt(r.recordedAt)} {r.recordedByName ?? ""}
                  </Text>
                </Group>
                <Text mt={4} size="sm">
                  {r.description}
                </Text>
              </Paper>
            ))}
          </Stack>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={20} />}>
            {error}
          </Alert>
        )}
        {saved && (
          <Alert color="green" icon={<IconCheck size={20} />}>
            {m.steps.defects.saved}
          </Alert>
        )}

        {canRecord && !open && (
          <Button
            leftSection={<IconPlus size={20} />}
            onClick={() => setOpen(true)}
            variant="light"
          >
            {m.steps.defects.open}
          </Button>
        )}

        {canRecord && open && (
          <Stack gap="sm">
            {rows.map((row, index) => (
              <Paper
                // biome-ignore lint/suspicious/noArrayIndexKey: 追記専用の行フォーム
                key={index}
                p="sm"
                radius="sm"
                withBorder
              >
                <Stack gap="xs">
                  <Group align="flex-end" gap="sm" wrap="nowrap">
                    <Select
                      aria-label={m.steps.defects.type}
                      data={defectTypes.map((d) => ({
                        value: String(d.id),
                        label: d.name,
                      }))}
                      label={m.steps.defects.type}
                      onChange={(v) =>
                        setRow(index, {
                          defectTypeId: v == null ? null : Number(v),
                        })
                      }
                      placeholder={m.steps.defects.typePlaceholder}
                      size="lg"
                      style={{ flex: 1 }}
                      value={
                        row.defectTypeId == null
                          ? null
                          : String(row.defectTypeId)
                      }
                    />
                    {rows.length > 1 && (
                      <ActionIcon
                        aria-label={m.steps.defects.removeRow}
                        color="red"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, i) => i !== index))
                        }
                        size={50}
                        variant="light"
                      >
                        <IconTrash size={24} />
                      </ActionIcon>
                    )}
                  </Group>
                  <Textarea
                    autosize
                    label={m.steps.defects.description}
                    minRows={2}
                    onChange={(e) =>
                      setRow(index, { description: e.currentTarget.value })
                    }
                    placeholder={m.steps.defects.descriptionPlaceholder}
                    size="lg"
                    value={row.description}
                  />
                </Stack>
              </Paper>
            ))}
            <Button
              leftSection={<IconPlus size={20} />}
              onClick={() => setRows((prev) => [...prev, EMPTY])}
              variant="subtle"
            >
              {m.steps.defects.addRow}
            </Button>
            <Group grow>
              <Button
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setRows([EMPTY]);
                  setError(null);
                }}
                variant="default"
              >
                {m.steps.actions.cancel}
              </Button>
              <Button
                color="red"
                disabled={complete.length === 0}
                loading={busy}
                onClick={save}
              >
                {m.steps.defects.save}
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
