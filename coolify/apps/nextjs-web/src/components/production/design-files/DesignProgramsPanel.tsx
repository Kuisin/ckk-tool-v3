"use client";

/**
 * DesignProgramsPanel — 設計図の版の加工プログラム。
 *
 * 1 本 = 名前 / プログラム番号 / 機種（0..N — 作業場所 MS0D の中の機種）/
 * 受け持つ工程（N）/ ファイル / 備考。プログラムは**版**を持つ（v1, v2 …）。
 *
 * 規則（lib/design-program-changes-core.ts）:
 *   - 工程を開始したときに出ていた版は「使用済み」。使用済みの版は直さず、
 *     「新しい版を作る」。古い版は「過去の版」に読むだけで残る。
 *   - 未使用の版は「直す」（その場）・「削除」。使った版があるプログラムは
 *     「廃止」（新しい工程に出さない）。
 *   - どれも申請で、承認設定（MS0B）の「加工プログラムの変更」を通る（段が
 *     無ければすぐ反映）。保留中の申請はプログラムのカードに承認カードで出る。
 *   - 図面の版の確定とは独立 — 確定後も申請できる。
 *
 * 一覧は閲覧の形で、操作はプログラムごとのボタン → モーダル（申請）。
 * 申請はファイルを含むので Route Handler（Server Action の本文上限を避ける）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Collapse,
  FileInput,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArchive,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconEdit,
  IconHistory,
  IconPlus,
  IconTrash,
  IconVersions,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  approveProgramChange,
  rejectProgramChange,
} from "@/app/(dashboard)/production/design-files/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, SecondaryButton } from "@/components/ui/buttons";
import { FormModal } from "@/components/ui/modals";
import { useIsMobile } from "@/hooks/useViewport";
import type { ProgramChangeKind } from "@/lib/design-program-changes-core";
import type {
  DesignProgramsData,
  DesignProgramView,
  ProgramChangeView,
  ProgramRevisionView,
} from "@/lib/design-programs";

type Option = { value: string; label: string };

/** 工程実行画面・図面の版で同じ形に出す 1 版ぶん。 */
type CardProgram = ProgramRevisionView & { modelMatch?: boolean };

function fileHref(id: string): string {
  return `/api/design-programs/${encodeURIComponent(id)}/file`;
}

/** 1 版の中身（名前の行は呼び出し側）。 */
function ProgramBody({ p }: { p: CardProgram }) {
  const tr = useTranslations();
  return (
    <>
      <Text size="xs">
        <Text c="dimmed" component="span" size="xs">
          {tr("production.designPrograms.machineModels")}:{" "}
        </Text>
        {p.machineModels.length > 0
          ? p.machineModels.map((m) => m.name).join("、")
          : tr("production.designPrograms.anyModel")}
      </Text>
      <Group gap={4} wrap="wrap">
        {p.processSteps.map((s) => (
          <Badge color="gray" key={s.id} size="xs" variant="light">
            {s.name}
          </Badge>
        ))}
      </Group>
      {p.fileId && p.filename ? (
        <Anchor href={fileHref(p.id)} size="sm">
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
    </>
  );
}

function ProgramTitle({
  p,
  children,
}: {
  p: CardProgram;
  children?: React.ReactNode;
}) {
  const tr = useTranslations();
  return (
    <Group gap="xs" wrap="wrap">
      <Text fw={600} size="sm">
        {p.name}
      </Text>
      <Badge color="gray" size="xs" tt="none" variant="outline">
        {tr("production.designPrograms.revision", { revision: p.revision })}
      </Badge>
      {p.programNumber && (
        <Text c="dimmed" ff="mono" size="xs">
          {p.programNumber}
        </Text>
      )}
      {children}
    </Group>
  );
}

/** 閲覧だけのカード列（工程実行画面）。 */
export function ProgramsView({
  programs,
  highlightMatch = false,
}: {
  programs: CardProgram[];
  /** 工程実行画面: 機種が一致した行に印を付ける。 */
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
            <ProgramTitle p={p}>
              {highlightMatch && p.modelMatch && (
                <Badge color="green" size="xs" variant="light">
                  {tr("production.designPrograms.modelMatch")}
                </Badge>
              )}
            </ProgramTitle>
            <ProgramBody p={p} />
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  );
}

/** 申請の中身の要約（承認者が何を承認するのか読めるように）。 */
function ChangeSummary({ change }: { change: ProgramChangeView }) {
  const tr = useTranslations();
  const fmt = useFormat();
  const c = change.content;
  return (
    <Stack gap={2}>
      {/* Badge は div — p（Text）の中に置くと HTML が不正になり hydration が割れる */}
      <Text component="div" size="xs">
        <Badge color="yellow" mr={6} size="xs" variant="light">
          {tr(`production.designPrograms.kind.${change.kind}`)}
        </Badge>
        {change.requestedByName
          ? tr("production.designPrograms.requestedBy", {
              name: change.requestedByName,
              at: fmt.dateTime(change.requestedAt),
            })
          : fmt.dateTime(change.requestedAt)}
      </Text>
      {c && (
        <>
          <Text size="xs">
            <Text c="dimmed" component="span" size="xs">
              {tr("production.designPrograms.name")}:{" "}
            </Text>
            {c.name}
            {c.programNumber ? ` (${c.programNumber})` : ""}
          </Text>
          <Text size="xs">
            <Text c="dimmed" component="span" size="xs">
              {tr("production.designPrograms.machineModels")}:{" "}
            </Text>
            {c.machineModels.length > 0
              ? c.machineModels.map((m) => m.name).join("、")
              : tr("production.designPrograms.anyModel")}
          </Text>
          <Text size="xs">
            <Text c="dimmed" component="span" size="xs">
              {tr("production.designPrograms.steps")}:{" "}
            </Text>
            {c.processSteps.map((s) => s.name).join("、")}
          </Text>
          <Text size="xs">
            <Text c="dimmed" component="span" size="xs">
              {tr("production.designPrograms.file")}:{" "}
            </Text>
            {c.file === "new"
              ? (c.newFilename ?? "—")
              : c.file === "remove"
                ? tr("production.designPrograms.noFile")
                : tr("production.designPrograms.fileKept")}
          </Text>
        </>
      )}
      {change.note && (
        <Text c="dimmed" size="xs" style={{ whiteSpace: "pre-wrap" }}>
          {change.note}
        </Text>
      )}
    </Stack>
  );
}

/** 保留中の申請 1 件（要約 + 承認 / 差し戻し）。 */
function PendingChange({
  change,
  approval,
}: {
  change: ProgramChangeView;
  approval: ApprovalActionState | undefined;
}) {
  return (
    <Stack gap="xs">
      <ChangeSummary change={change} />
      {approval && approval.phase === "PENDING" && (
        <ApprovalActionCard
          approval={approval}
          canRequest={false}
          onApprove={() => approveProgramChange(change.id)}
          onReject={(reason) => rejectProgramChange(change.id, reason)}
          rejectReason={null}
          subject={change.content?.name ?? change.baseName ?? ""}
        />
      )}
    </Stack>
  );
}

/** 申請モーダルの対象。 */
type Dialog =
  | { kind: "ADD"; program: null }
  | {
      kind: Exclude<ProgramChangeKind, "ADD">;
      program: DesignProgramView;
    };

export function DesignProgramsPanel({
  versionId,
  data,
  canManage,
  changeApprovals,
  machineModelOptions,
  stepOptions,
}: {
  versionId: string;
  data: DesignProgramsData;
  /** design_file:UPDATE — 申請を出せる。 */
  canManage: boolean;
  changeApprovals: Record<string, ApprovalActionState>;
  machineModelOptions: Option[];
  stepOptions: Option[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const fmt = useFormat();

  return (
    <Stack gap="sm" id="programs">
      <Group align="flex-start" justify="space-between" wrap="wrap">
        <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
          <Title order={5}>{tr("production.designPrograms.title")}</Title>
          <Text c="dimmed" size="xs">
            {tr("production.designPrograms.description")}
          </Text>
        </Stack>
        {canManage && (
          <SecondaryButton
            fullWidth={isMobile}
            leftSection={<IconPlus size={14} />}
            onClick={() => setDialog({ kind: "ADD", program: null })}
          >
            {tr("production.designPrograms.add")}
          </SecondaryButton>
        )}
      </Group>

      {data.failed.map((f) => (
        <Alert
          color="orange"
          key={f.id}
          title={tr("production.designPrograms.failedTitle", {
            kind: tr(`production.designPrograms.kind.${f.kind}`),
            name: f.content?.name ?? f.baseName ?? "",
          })}
        >
          <Text size="xs">{f.error}</Text>
        </Alert>
      ))}

      {data.pendingAdds.map((c) => (
        <Paper key={c.id} p="sm" radius="sm" withBorder>
          <Stack gap="xs">
            <Group gap="xs">
              <Text fw={600} size="sm">
                {c.content?.name}
              </Text>
              <Badge color="yellow" size="xs" variant="light">
                {tr("production.designPrograms.pendingBadge")}
              </Badge>
            </Group>
            <PendingChange approval={changeApprovals[c.id]} change={c} />
          </Stack>
        </Paper>
      ))}

      {data.programs.length === 0 && data.pendingAdds.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("production.designPrograms.none")}
        </Text>
      ) : (
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          {data.programs.map((p) => {
            const historyOpen = openHistory[p.programKey] ?? false;
            const a = p.actions;
            const any = a.edit || a.revise || a.delete || a.retire;
            return (
              <Paper
                key={p.programKey}
                p="sm"
                radius="sm"
                style={p.retiredAt ? { opacity: 0.7 } : undefined}
                withBorder
              >
                <Stack gap={4}>
                  <ProgramTitle p={p}>
                    {p.retiredAt ? (
                      <Badge color="gray" size="xs" variant="filled">
                        {tr("production.designPrograms.retired")}
                      </Badge>
                    ) : p.used ? (
                      <Badge color="blue" size="xs" variant="light">
                        {tr("production.designPrograms.used", {
                          count: p.useCount,
                        })}
                      </Badge>
                    ) : (
                      <Badge color="gray" size="xs" variant="light">
                        {tr("production.designPrograms.unused")}
                      </Badge>
                    )}
                    {p.pending && (
                      <Badge color="yellow" size="xs" variant="light">
                        {tr("production.designPrograms.pendingBadge")}
                      </Badge>
                    )}
                  </ProgramTitle>
                  <ProgramBody p={p} />

                  {canManage && any && (
                    <Group gap={4} mt={4} wrap="wrap">
                      {a.edit && (
                        <GhostButton
                          leftSection={<IconEdit size={14} />}
                          onClick={() =>
                            setDialog({ kind: "EDIT", program: p })
                          }
                          size="xs"
                        >
                          {tr("production.designPrograms.actionEdit")}
                        </GhostButton>
                      )}
                      {a.revise && (
                        <GhostButton
                          leftSection={<IconVersions size={14} />}
                          onClick={() =>
                            setDialog({ kind: "REVISE", program: p })
                          }
                          size="xs"
                        >
                          {tr("production.designPrograms.actionRevise")}
                        </GhostButton>
                      )}
                      {a.retire && (
                        <GhostButton
                          color="red"
                          leftSection={<IconArchive size={14} />}
                          onClick={() =>
                            setDialog({ kind: "RETIRE", program: p })
                          }
                          size="xs"
                        >
                          {tr("production.designPrograms.actionRetire")}
                        </GhostButton>
                      )}
                      {a.delete && (
                        <GhostButton
                          color="red"
                          leftSection={<IconTrash size={14} />}
                          onClick={() =>
                            setDialog({ kind: "DELETE", program: p })
                          }
                          size="xs"
                        >
                          {tr("production.designPrograms.actionDelete")}
                        </GhostButton>
                      )}
                    </Group>
                  )}
                  {canManage && a.revise && (
                    <Text c="dimmed" size="xs">
                      {tr("production.designPrograms.usedHint")}
                    </Text>
                  )}

                  {p.pending && (
                    <Paper
                      bg="var(--mantine-color-yellow-light)"
                      p="xs"
                      radius="sm"
                    >
                      <PendingChange
                        approval={changeApprovals[p.pending.id]}
                        change={p.pending}
                      />
                    </Paper>
                  )}

                  {p.history.length > 0 && (
                    <>
                      <Anchor
                        component="button"
                        onClick={() =>
                          setOpenHistory((h) => ({
                            ...h,
                            [p.programKey]: !historyOpen,
                          }))
                        }
                        size="xs"
                        type="button"
                      >
                        <Group gap={4} wrap="nowrap">
                          <IconHistory size={14} />
                          {tr("production.designPrograms.history", {
                            count: p.history.length,
                          })}
                          {historyOpen ? (
                            <IconChevronUp size={12} />
                          ) : (
                            <IconChevronDown size={12} />
                          )}
                        </Group>
                      </Anchor>
                      <Collapse expanded={historyOpen}>
                        <Stack gap="xs" mt={4}>
                          {p.history.map((h) => (
                            <Paper key={h.id} p="xs" radius="sm" withBorder>
                              <Stack gap={2}>
                                <ProgramTitle p={h}>
                                  <Text c="dimmed" size="xs">
                                    {h.supersededAt
                                      ? tr(
                                          "production.designPrograms.supersededAt",
                                          { at: fmt.date(h.supersededAt) },
                                        )
                                      : ""}
                                  </Text>
                                  {h.useCount > 0 && (
                                    <Badge
                                      color="blue"
                                      size="xs"
                                      variant="light"
                                    >
                                      {tr("production.designPrograms.used", {
                                        count: h.useCount,
                                      })}
                                    </Badge>
                                  )}
                                </ProgramTitle>
                                <ProgramBody p={h} />
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                      </Collapse>
                    </>
                  )}
                </Stack>
              </Paper>
            );
          })}
        </SimpleGrid>
      )}

      {dialog && (
        <ProgramChangeModal
          dialog={dialog}
          machineModelOptions={machineModelOptions}
          onClose={() => setDialog(null)}
          stepOptions={stepOptions}
          versionId={versionId}
        />
      )}
    </Stack>
  );
}

/** 申請モーダル（追加 / 直す / 新しい版 / 削除 / 廃止）。開くたびにマウント。 */
function ProgramChangeModal({
  versionId,
  dialog,
  machineModelOptions,
  stepOptions,
  onClose,
}: {
  versionId: string;
  dialog: Dialog;
  machineModelOptions: Option[];
  stepOptions: Option[];
  onClose: () => void;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const base = dialog.program;
  const hasContent =
    dialog.kind === "ADD" || dialog.kind === "EDIT" || dialog.kind === "REVISE";
  const [name, setName] = useState(base?.name ?? "");
  const [programNumber, setProgramNumber] = useState(base?.programNumber ?? "");
  // 機種の選択肢に、無効になった機種も（いま付いている分だけ）残す。
  const modelOptions = [
    ...machineModelOptions,
    ...(base?.machineModels ?? [])
      .filter((m) => !machineModelOptions.some((o) => o.value === String(m.id)))
      .map((m) => ({ value: String(m.id), label: m.name })),
  ];
  const [modelIds, setModelIds] = useState<string[]>(
    (base?.machineModels ?? []).map((m) => String(m.id)),
  );
  const [stepIds, setStepIds] = useState<string[]>(
    (base?.processSteps ?? []).map((s) => String(s.id)),
  );
  const [notes, setNotes] = useState(base?.notes ?? "");
  const hasBaseFile = !!base?.fileId;
  const [fileMode, setFileMode] = useState<"keep" | "remove" | "new">(
    hasBaseFile ? "keep" : "new",
  );
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const nameMissing = hasContent && name.trim() === "";
  const stepsMissing = hasContent && stepIds.length === 0;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setShowErrors(true);
    if (nameMissing || stepsMissing) return;
    setBusy(true);
    try {
      const body = new FormData();
      const effectiveFile: "keep" | "remove" | "new" =
        fileMode === "new" && !file
          ? hasBaseFile && dialog.kind !== "ADD"
            ? "keep"
            : "remove"
          : fileMode;
      if (effectiveFile === "new" && file) body.append("file", file);
      body.append(
        "change",
        JSON.stringify({
          kind: dialog.kind,
          programId: base?.id ?? null,
          content: hasContent
            ? {
                name: name.trim(),
                programNumber: programNumber.trim() || null,
                machineModelIds: modelIds.map(Number),
                processStepIds: stepIds.map(Number),
                notes: notes.trim() || null,
                file: effectiveFile,
              }
            : null,
          note: note.trim() || null,
        }),
      );
      const res = await fetch(
        `/api/design-files/versions/${encodeURIComponent(versionId)}/programs`,
        { method: "POST", body },
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        pending?: boolean;
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
        title: json.pending
          ? tr("production.designPrograms.requested")
          : tr("production.designPrograms.applied"),
        message: name || base?.name || tr("production.designPrograms.title"),
        color: "green",
      });
      onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormModal
      loading={busy}
      onClose={onClose}
      onSubmit={submit}
      opened
      size="lg"
      submitLabel={tr("production.designPrograms.submitRequest")}
      title={tr(`production.designPrograms.modalTitle.${dialog.kind}`, {
        name: base?.name ?? "",
        revision: (base?.revision ?? 0) + 1,
      })}
    >
      <Stack gap="sm">
        <Text c="dimmed" size="xs">
          {tr(`production.designPrograms.modalHint.${dialog.kind}`)}
        </Text>
        {hasContent && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              error={
                showErrors && nameMissing
                  ? tr("production.designPrograms.nameRequired")
                  : undefined
              }
              label={tr("production.designPrograms.name")}
              onChange={(e) => setName(e.currentTarget.value)}
              value={name}
              withAsterisk
            />
            <TextInput
              label={tr("production.designPrograms.programNumber")}
              onChange={(e) => setProgramNumber(e.currentTarget.value)}
              value={programNumber}
            />
            <MultiSelect
              clearable
              data={modelOptions}
              description={tr("production.designPrograms.machineModelsHint")}
              label={tr("production.designPrograms.machineModels")}
              onChange={setModelIds}
              placeholder={
                modelIds.length === 0
                  ? tr("production.designPrograms.anyModel")
                  : undefined
              }
              searchable={modelOptions.length > 5}
              value={modelIds}
            />
            <MultiSelect
              data={stepOptions}
              error={
                showErrors && stepsMissing
                  ? tr("production.designPrograms.stepsRequired")
                  : undefined
              }
              label={tr("production.designPrograms.steps")}
              onChange={setStepIds}
              searchable
              value={stepIds}
              withAsterisk
            />
            <Stack gap={4}>
              {hasBaseFile && dialog.kind !== "ADD" && (
                <SegmentedControl
                  data={[
                    {
                      value: "keep",
                      label: tr("production.designPrograms.keepFile"),
                    },
                    {
                      value: "new",
                      label: tr("production.designPrograms.replaceFile"),
                    },
                    {
                      value: "remove",
                      label: tr("production.designPrograms.removeFile"),
                    },
                  ]}
                  onChange={(v) => setFileMode(v as typeof fileMode)}
                  size="xs"
                  value={fileMode}
                />
              )}
              {fileMode === "new" && (
                <FileInput
                  clearable
                  label={tr("production.designPrograms.file")}
                  onChange={setFile}
                  placeholder={tr("production.designPrograms.chooseFile")}
                  value={file}
                />
              )}
              {fileMode === "keep" && base?.filename && (
                <Text c="dimmed" size="xs">
                  {tr("production.designPrograms.currentFile", {
                    name: base.filename,
                  })}
                </Text>
              )}
            </Stack>
            <Textarea
              autosize
              label={tr("common.notes")}
              minRows={1}
              onChange={(e) => setNotes(e.currentTarget.value)}
              value={notes}
            />
          </SimpleGrid>
        )}
        {!hasContent && base && (
          <Paper p="sm" radius="sm" withBorder>
            <Stack gap={4}>
              <ProgramTitle p={base} />
              <ProgramBody p={base} />
            </Stack>
          </Paper>
        )}
        <Textarea
          autosize
          description={tr("production.designPrograms.requestNoteHint")}
          label={tr("production.designPrograms.requestNote")}
          minRows={2}
          onChange={(e) => setNote(e.currentTarget.value)}
          value={note}
        />
      </Stack>
    </FormModal>
  );
}
