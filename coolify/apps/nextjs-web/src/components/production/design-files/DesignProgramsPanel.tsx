"use client";

/**
 * DesignProgramsPanel — 設計図の版の加工プログラム（閲覧で開き、押して編集）。
 *
 * 1 本 = 名前 / プログラム番号 / 機械（= 作業場所 MS0D）/ 受け持つ工程（N）/
 * ファイル / 備考。機械のマスタは無い — 作業場所がそのまま機械。
 *
 * 編集できるのは版が編集できるあいだだけ（呼び出し側が canEdit で渡す）。
 * 保存は版ぶんを丸ごと置き換える 1 回の POST（ファイルを含むので Route
 * Handler — Server Action の本文上限を避ける）。
 */

import {
  ActionIcon,
  Anchor,
  Badge,
  FileInput,
  Group,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconDownload,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SecondaryButton } from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FormActions } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { DesignProgramView } from "@/lib/design-programs";

type Option = { value: string; label: string };

/** 編集中の 1 行。`key` は画面上の識別（新規行は id が無いため）。 */
interface DraftRow {
  key: string;
  id?: string;
  name: string;
  programNumber: string;
  workLocationId: string | null;
  processStepIds: string[];
  notes: string;
  filename: string | null;
  removeFile: boolean;
  newFile: File | null;
}

let draftSeq = 0;
const nextKey = () => `new-${++draftSeq}`;

function toDraft(p: DesignProgramView): DraftRow {
  return {
    key: p.id,
    id: p.id,
    name: p.name,
    programNumber: p.programNumber ?? "",
    workLocationId: p.workLocationId == null ? null : String(p.workLocationId),
    processStepIds: p.processSteps.map((s) => String(s.id)),
    notes: p.notes ?? "",
    filename: p.filename,
    removeFile: false,
    newFile: null,
  };
}

export function DesignProgramsPanel({
  versionId,
  programs,
  canEdit,
  workLocationOptions,
  stepOptions,
  onSaved,
}: {
  versionId: string;
  programs: DesignProgramView[];
  canEdit: boolean;
  workLocationOptions: Option[];
  stepOptions: Option[];
  onSaved: () => void;
}) {
  const tr = useTranslations();
  return (
    <EditablePanel
      canEdit={canEdit}
      description={tr("production.designPrograms.description")}
      edit={({ close }) => (
        <ProgramsEditor
          onCancel={close}
          onSaved={() => {
            close();
            onSaved();
          }}
          programs={programs}
          stepOptions={stepOptions}
          versionId={versionId}
          workLocationOptions={workLocationOptions}
        />
      )}
      title={tr("production.designPrograms.title")}
      view={<ProgramsView programs={programs} />}
    />
  );
}

/** 閲覧（1 本 = 1 カード）。 */
export function ProgramsView({
  programs,
  highlightMatch = false,
}: {
  programs: (DesignProgramView & { machineMatch?: boolean })[];
  /** 工程実行画面: 機械が一致した行に印を付ける。 */
  highlightMatch?: boolean;
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  if (programs.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {tr("production.designPrograms.none")}
      </Text>
    );
  }
  return (
    <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
      {programs.map((p) => (
        <Paper key={p.id} p="sm" radius="sm" withBorder>
          <Stack gap={4}>
            <Group gap="xs" wrap="wrap">
              <Text fw={600} size="sm">
                {p.name}
              </Text>
              {p.programNumber && (
                <Text c="dimmed" ff="mono" size="xs">
                  {p.programNumber}
                </Text>
              )}
              {highlightMatch && p.machineMatch && (
                <Badge color="green" size="xs" variant="light">
                  {tr("production.designPrograms.machineMatch")}
                </Badge>
              )}
            </Group>
            <Text size="xs">
              <Text c="dimmed" component="span" size="xs">
                {tr("production.designPrograms.machine")}:{" "}
              </Text>
              {p.workLocationName ?? tr("production.designPrograms.anyMachine")}
            </Text>
            <Group gap={4} wrap="wrap">
              {p.processSteps.map((s) => (
                <Badge color="gray" key={s.id} size="xs" variant="light">
                  {s.name}
                </Badge>
              ))}
            </Group>
            {p.fileId && p.filename ? (
              <Anchor
                href={`/api/design-programs/${encodeURIComponent(p.id)}/file`}
                size="sm"
              >
                <Group gap={4} wrap="nowrap">
                  <IconDownload size={14} />
                  <Text className="min-w-0" size="sm" truncate>
                    {p.filename}
                  </Text>
                </Group>
              </Anchor>
            ) : (
              <Text c="dimmed" size="xs">
                {tr("production.designPrograms.noFile")}
              </Text>
            )}
            {p.notes && (
              <Text c="dimmed" size="xs" style={{ whiteSpace: "pre-wrap" }}>
                {p.notes}
              </Text>
            )}
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

function ProgramsEditor({
  versionId,
  programs,
  workLocationOptions,
  stepOptions,
  onCancel,
  onSaved,
}: {
  versionId: string;
  programs: DesignProgramView[];
  workLocationOptions: Option[];
  stepOptions: Option[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const [rows, setRows] = useState<DraftRow[]>(() => programs.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const patch = (key: string, p: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const invalid = (r: DraftRow) =>
    r.name.trim() === "" || r.processStepIds.length === 0;

  const save = async () => {
    setShowErrors(true);
    if (rows.some(invalid)) return;
    setBusy(true);
    try {
      const body = new FormData();
      const payload = rows.map((r, i) => {
        const fileField = r.newFile ? `file${i}` : null;
        if (r.newFile && fileField) body.append(fileField, r.newFile);
        return {
          ...(r.id ? { id: r.id } : {}),
          name: r.name.trim(),
          programNumber: r.programNumber.trim() || null,
          workLocationId: r.workLocationId ? Number(r.workLocationId) : null,
          processStepIds: r.processStepIds.map(Number),
          notes: r.notes.trim() || null,
          removeFile: r.removeFile,
          fileField,
        };
      });
      body.append("programs", JSON.stringify(payload));
      const res = await fetch(
        `/api/design-files/versions/${encodeURIComponent(versionId)}/programs`,
        { method: "POST", body },
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        notifications.show({
          title: tr("common.error2"),
          message: json?.error ?? tr("common.failed"),
          color: "red",
        });
        return;
      }
      notifications.show({
        title: tr("common.saved2"),
        message: tr("production.designPrograms.title"),
        color: "green",
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="sm">
      {rows.length === 0 && (
        <Text c="dimmed" size="sm">
          {tr("production.designPrograms.none")}
        </Text>
      )}
      {rows.map((r, i) => (
        <Paper key={r.key} p="sm" radius="sm" withBorder>
          <Stack gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <Text c="dimmed" className="tabular-nums" size="xs">
                #{i + 1}
              </Text>
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  aria-label={tr("common.moveUp")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  variant="subtle"
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("common.moveDown")}
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  variant="subtle"
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("production.designPrograms.remove")}
                  color="red"
                  onClick={() =>
                    setRows((rs) => rs.filter((x) => x.key !== r.key))
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                error={
                  showErrors && r.name.trim() === ""
                    ? tr("production.designPrograms.nameRequired")
                    : undefined
                }
                label={tr("production.designPrograms.name")}
                onChange={(e) => patch(r.key, { name: e.currentTarget.value })}
                value={r.name}
                withAsterisk
              />
              <TextInput
                label={tr("production.designPrograms.programNumber")}
                onChange={(e) =>
                  patch(r.key, { programNumber: e.currentTarget.value })
                }
                value={r.programNumber}
              />
              <Select
                clearable
                data={workLocationOptions}
                description={tr("production.designPrograms.machineHint")}
                label={tr("production.designPrograms.machine")}
                onChange={(v) => patch(r.key, { workLocationId: v })}
                placeholder={tr("production.designPrograms.anyMachine")}
                searchable={workLocationOptions.length > 5}
                value={r.workLocationId}
              />
              <MultiSelect
                data={stepOptions}
                error={
                  showErrors && r.processStepIds.length === 0
                    ? tr("production.designPrograms.stepsRequired")
                    : undefined
                }
                label={tr("production.designPrograms.steps")}
                onChange={(v) => patch(r.key, { processStepIds: v })}
                searchable
                value={r.processStepIds}
                withAsterisk
              />
              <Stack gap={4}>
                <FileInput
                  clearable
                  label={tr("production.designPrograms.file")}
                  onChange={(f) => patch(r.key, { newFile: f })}
                  placeholder={
                    r.filename && !r.removeFile
                      ? r.filename
                      : tr("production.designPrograms.chooseFile")
                  }
                  value={r.newFile}
                />
                {r.filename && !r.newFile && (
                  <Anchor
                    component="button"
                    onClick={() => patch(r.key, { removeFile: !r.removeFile })}
                    size="xs"
                    type="button"
                  >
                    {r.removeFile
                      ? tr("production.designPrograms.keepFile")
                      : tr("production.designPrograms.removeFile")}
                  </Anchor>
                )}
              </Stack>
              <Textarea
                autosize
                label={tr("common.notes")}
                minRows={1}
                onChange={(e) => patch(r.key, { notes: e.currentTarget.value })}
                value={r.notes}
              />
            </SimpleGrid>
          </Stack>
        </Paper>
      ))}
      <SecondaryButton
        leftSection={<IconPlus size={14} />}
        onClick={() =>
          setRows((rs) => [
            ...rs,
            {
              key: nextKey(),
              name: "",
              programNumber: "",
              workLocationId: null,
              processStepIds: [],
              notes: "",
              filename: null,
              removeFile: false,
              newFile: null,
            },
          ])
        }
      >
        {tr("production.designPrograms.add")}
      </SecondaryButton>
      <FormActions loading={busy} onCancel={onCancel} onSave={save} />
    </Stack>
  );
}
