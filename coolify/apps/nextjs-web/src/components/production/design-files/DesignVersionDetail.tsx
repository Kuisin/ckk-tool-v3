"use client";

/**
 * DesignVersionDetail — 設計図の版 1 つの詳細（/production/design-files/versions/[id]）。
 *
 * 書類と同じ並び（_specs/design.md §8.2）:
 *   ActionCard（いまやること）→ SummaryGrid → 手続き状況 → 仕様 → ファイル → 履歴
 *
 * 版の一生は **下書き → (承認) → 確定**。承認の段は承認設定 (MS0B) の
 * 「設計図の版」が決め、段が無ければ「確定」ボタン 1 つで確定する。
 * 確定前（下書き・差し戻し）だけ仕様とファイルを直せる（閲覧で開き、
 * 「編集」で編集 — §10.10）。確定した版は動かない。
 */

import {
  Anchor,
  Badge,
  Divider,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import {
  approveDesignVersion,
  deleteDesignFile,
  deleteDesignVersion,
  rejectDesignVersion,
  submitDesignVersion,
  updateDesignFileNotes,
  updateDesignVersion,
} from "@/app/(dashboard)/production/design-files/actions";
import {
  ApprovalActionCard,
  type ApprovalActionState,
} from "@/components/approvals/ApprovalActionCard";
import {
  ApprovalTrailList,
  type ApprovalTrailView,
  countTrailRecords,
} from "@/components/approvals/ApprovalTrailList";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActionCard } from "@/components/ui/ActionCard";
import {
  DangerButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FieldValue } from "@/components/ui/FieldValue";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { ConfirmModal, ModalShell } from "@/components/ui/modals";
import {
  approvalStage,
  ProcedurePanel,
  procedureStages,
} from "@/components/ui/ProcedurePanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  type AuditEntry,
  AuditTimeline,
  DetailShell,
  FormActions,
  SummaryGrid,
} from "@/components/ui/shells";
import { canDeleteVersion, isVersionEditable } from "@/lib/design-files-core";
import type { MemoView } from "@/lib/document-memos";
import type { ProductItemDef, ResolvedProductType } from "@/lib/product-types";
import type { SxfDrawingReading } from "@/lib/sxf-core";
import { DesignFileList, type DesignFileListRow } from "./DesignFileList";
import {
  applySxfReading,
  type DesignSpecErrors,
  DesignSpecFields,
  type DesignSpecFormState,
  initialDesignSpecState,
  toVersionSpecPayload,
  validateDesignSpec,
} from "./DesignSpecFields";
import { DesignSpecView } from "./DesignSpecView";
import type { DesignVersionView } from "./model";
import {
  appendFileSlots,
  EMPTY_FILE_SLOTS,
  hasAnyFile,
  readSxfFile,
  SxfReadNotice,
  type VersionFileSlotState,
  VersionFileSlots,
} from "./VersionFileSlots";

const BASE_PATH = "/production/design-files";

export function DesignVersionDetail({
  version: v,
  productLabel,
  approval,
  approvalTrail,
  flowConfigured,
  canManage,
  canDelete: canDeletePermission,
  auditEntries,
  productTypes,
  itemDefs,
  memosByFile = {},
}: {
  version: DesignVersionView;
  productLabel: string;
  approval: ApprovalActionState;
  approvalTrail: ApprovalTrailView[];
  /** 承認設定 (MS0B) に段があるか。無ければ「確定」で即確定する。 */
  flowConfigured: boolean;
  /** design_file:UPDATE — 仕様・ファイルを直し、確定へ進められる。 */
  canManage: boolean;
  /** design_file:DELETE — 下書きの版を消せる。 */
  canDelete: boolean;
  auditEntries: AuditEntry[];
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
  /** ファイル id → メモ（リッチテキスト。確定後も書ける — 凍るのは図面の中身だけ）。 */
  memosByFile?: Record<string, MemoView[]>;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [removing, setRemoving] = useState<DesignFileListRow | null>(null);
  const [editingNote, setEditingNote] = useState<DesignFileListRow | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [memoFor, setMemoFor] = useState<DesignFileListRow | null>(null);

  const editable = isVersionEditable(v.status);
  const title = `${productLabel} v${v.version}`;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
    after?: () => void,
  ) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        notifications.show({ title: done, message: title, color: "green" });
        setConfirmOpen(false);
        setRemoving(null);
        setEditingNote(null);
        after?.();
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error ?? tr("common.failed"),
          color: "red",
        });
      }
    });

  // ── いまやること ──────────────────────────────────────────────────────────
  let actionCard: ReactNode = null;
  if (canManage && editable && !flowConfigured) {
    actionCard = (
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconCheck size={14} />}
            loading={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {tr("production.designVersion.confirm")}
          </PrimaryButton>
        }
        description={tr("production.designVersion.confirmCardDesc")}
        icon={<IconCheck size={20} />}
        title={
          v.status === "REJECTED"
            ? tr("approvals.approvalActionCard.itWasSentBack")
            : tr("production.designVersion.confirmCardTitle")
        }
        tone={v.status === "REJECTED" ? "alert" : "action"}
      />
    );
  } else if (
    (canManage && editable && flowConfigured) ||
    v.status === "REQUESTED"
  ) {
    const lastReject = [...approvalTrail]
      .flatMap((s) => s.records)
      .reverse()
      .find((r) => r.action === "REJECTED");
    actionCard = (
      <ApprovalActionCard
        approval={approval}
        canRequest={canManage && editable}
        onApprove={() => approveDesignVersion(v.id)}
        onReject={(reason) => rejectDesignVersion(v.id, reason)}
        onRequest={() => submitDesignVersion(v.id)}
        rejectReason={lastReject?.comment ?? null}
        subject={title}
      />
    );
  }

  // ── 手続き状況（作成 → [承認] → 確定）─────────────────────────────────────
  const showApproval = flowConfigured || approval.phase !== "NONE";
  const defs = [
    {
      key: "created",
      label: tr("production.designVersion.stageDraft"),
      description: fmt.date(v.createdAt),
      color: v.status === "REJECTED" ? "red" : undefined,
    },
    ...(showApproval
      ? [
          approvalStage(approval, {
            approvedAt: v.status === "CONFIRMED" ? v.confirmedAt : null,
            fmtDate: (d) => fmt.date(d),
            tr,
          }),
        ]
      : []),
    {
      key: "confirmed",
      label: tr("common.confirmed"),
      description: v.confirmedAt ? fmt.date(v.confirmedAt) : "—",
    },
  ];
  const current =
    v.status === "CONFIRMED" ? defs.length : v.status === "REQUESTED" ? 1 : 0;
  const stages = procedureStages(defs, current);

  const fileRows: DesignFileListRow[] = v.files.map((f) => ({
    ...f,
    versionStatus: v.status,
  }));

  return (
    <DetailShell
      actions={
        canDeletePermission && canDeleteVersion(v.status) ? (
          <DangerButton
            leftSection={<IconTrash size={14} />}
            onClick={() => setDeleteOpen(true)}
            variant="subtle"
          >
            {tr("production.designVersion.deleteVersion")}
          </DangerButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("common.production"),
        { label: tr("common.drawing"), href: BASE_PATH },
        { label: productLabel, href: `${BASE_PATH}/${v.itemId}` },
        `v${v.version}`,
      ]}
      createdAt={fmt.dateTime(v.createdAt)}
      status={<StatusBadge entity="DesignVersion" status={v.status} />}
      title={title}
    >
      {actionCard}

      <SummaryGrid>
        <FieldValue
          label={tr("common.orderingCustomer")}
          value={
            v.customerBpId == null ? (
              <Badge color="gray" variant="light">
                {tr("common.generic")}
              </Badge>
            ) : (
              v.customerName
            )
          }
        />
        <FieldValue
          label={tr("production.designFiles.originalRequest")}
          value={
            v.requestNumber ? (
              <Anchor
                href={`/sales/design-requests/${encodeURIComponent(v.requestNumber)}`}
                size="sm"
              >
                {v.requestNumber}
              </Anchor>
            ) : (
              tr("common.manual")
            )
          }
        />
        <FieldValue
          label={tr("production.designVersion.latestConfirmed")}
          value={
            v.isLatestConfirmed
              ? tr("common.yes")
              : v.status === "CONFIRMED"
                ? tr("production.designVersion.superseded")
                : "—"
          }
        />
        <FieldValue
          label={tr("common.createdBy")}
          value={`${v.createdByName ?? "—"}（${fmt.dateTime(v.createdAt)}）`}
        />
        <FieldValue
          label={tr("production.designVersion.confirmedBy")}
          value={
            v.confirmedAt
              ? `${v.confirmedByName ?? "—"}（${fmt.dateTime(v.confirmedAt)}）`
              : "—"
          }
        />
        {v.notes && (
          <FieldValue fullWidth label={tr("common.memo")} value={v.notes} />
        )}
      </SummaryGrid>

      <ProcedurePanel stages={stages}>
        {countTrailRecords(approvalTrail) > 0 && (
          <>
            <Divider my="md" />
            <ApprovalTrailList trail={approvalTrail} />
          </>
        )}
      </ProcedurePanel>

      <Paper p="md" radius="md" withBorder>
        <EditablePanel
          canEdit={canManage && editable}
          edit={({ close }) => (
            <SpecEditor
              itemDefs={itemDefs}
              onDone={() => {
                close();
                router.refresh();
              }}
              productTypes={productTypes}
              version={v}
            />
          )}
          title={tr("production.designVersion.spec")}
          view={
            <DesignSpecView
              data={v}
              itemDefs={itemDefs}
              productTypes={productTypes}
            />
          }
        />
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Group justify="space-between" mb="sm">
          <Title order={5}>{tr("common.file")}</Title>
          {canManage && editable && (
            <SecondaryButton
              leftSection={<IconPlus size={14} />}
              onClick={() => setAddOpen(true)}
            >
              {tr("production.designVersion.addFiles")}
            </SecondaryButton>
          )}
        </Group>
        {fileRows.length === 0 ? (
          <Text c="dimmed" size="sm">
            {tr("production.designVersion.noFiles")}
          </Text>
        ) : (
          <DesignFileList
            onDelete={canManage ? setRemoving : undefined}
            onEdit={
              canManage
                ? (row) => {
                    setEditingNote(row);
                    setNote(row.notes ?? "");
                  }
                : undefined
            }
            onMemo={setMemoFor}
            rows={fileRows}
          />
        )}
      </Paper>

      <Paper p="md" radius="md" withBorder>
        <Title mb="sm" order={5}>
          {tr("common.history")}
        </Title>
        <AuditTimeline entries={auditEntries} />
      </Paper>

      <ConfirmModal
        confirmColor="blue"
        confirmLabel={tr("production.designVersion.confirm")}
        loading={isPending}
        message={tr("production.designVersion.confirmModalMessage")}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () => submitDesignVersion(v.id),
            tr("production.designVersion.confirmedToast"),
          )
        }
        opened={confirmOpen}
        title={tr("production.designVersion.confirmModalTitle", {
          version: v.version,
        })}
      />

      <ConfirmModal
        confirmLabel={tr("common.delete")}
        loading={isPending}
        message={tr("production.designVersion.deleteVersionConfirm", {
          version: v.version,
        })}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteDesignVersion(v.id);
            if (res.ok) {
              notifications.show({
                title: tr("common.deleted"),
                message: title,
                color: "green",
              });
              router.push(`${BASE_PATH}/${v.itemId}`);
            } else {
              notifications.show({
                title: tr("common.error2"),
                message: res.error,
                color: "red",
              });
            }
          })
        }
        opened={deleteOpen}
        title={tr("production.designVersion.deleteVersion")}
      />

      <ConfirmModal
        confirmLabel={tr("production.designVersion.removeFile")}
        loading={isPending}
        message={
          removing
            ? tr("production.designVersion.removeFileConfirm", {
                filename: removing.filename,
              })
            : ""
        }
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing &&
          run(() => deleteDesignFile(removing.id), tr("common.deleted"))
        }
        opened={removing != null}
        title={tr("production.designVersion.removeFile")}
      />

      <ModalShell
        confirmLabel={tr("common.save2")}
        loading={isPending}
        onClose={() => setEditingNote(null)}
        onConfirm={() =>
          editingNote &&
          run(
            () => updateDesignFileNotes({ id: editingNote.id, notes: note }),
            tr("common.saved2"),
          )
        }
        opened={editingNote != null}
        title={editingNote?.filename ?? tr("common.notes")}
      >
        <Textarea
          autosize
          label={tr("common.notes")}
          minRows={3}
          onChange={(e) => setNote(e.currentTarget.value)}
          value={note}
        />
      </ModalShell>

      <ModalShell
        hideFooter
        onClose={() => setMemoFor(null)}
        opened={memoFor != null}
        size="lg"
        title={memoFor?.filename ?? tr("common.memo")}
      >
        {memoFor && (
          <MemoPanel
            memos={memosByFile[memoFor.id] ?? []}
            mode="memo"
            ownerId={memoFor.id}
            ownerType="design_files"
          />
        )}
      </ModalShell>

      <AddFilesModal
        itemDefs={itemDefs}
        onClose={() => setAddOpen(false)}
        onDone={() => {
          setAddOpen(false);
          router.refresh();
        }}
        opened={addOpen}
        productTypes={productTypes}
        version={v}
      />
    </DetailShell>
  );
}

/** 仕様の編集（EditablePanel の編集側 — 閉じるとアンマウントされる）。 */
function SpecEditor({
  version: v,
  productTypes,
  itemDefs,
  onDone,
}: {
  version: DesignVersionView;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
  onDone: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [spec, setSpec] = useState<DesignSpecFormState>(() =>
    initialDesignSpecState(v, productTypes, itemDefs),
  );
  const [errors, setErrors] = useState<DesignSpecErrors | null>(null);

  const save = () => {
    const e = validateDesignSpec(spec, productTypes, itemDefs, tr);
    setErrors(e);
    if (e) return;
    startTransition(async () => {
      const res = await updateDesignVersion(
        v.id,
        toVersionSpecPayload(spec, productTypes),
      );
      if (res.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: "",
          color: "green",
        });
        onDone();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <DesignSpecFields
        errors={errors}
        itemDefs={itemDefs}
        onChange={setSpec}
        productTypes={productTypes}
        value={spec}
      />
      <FormActions loading={isPending} onCancel={onDone} onSave={save} />
    </Stack>
  );
}

/**
 * ファイルの追加（確定前のみ）。2D 原図に .sfc を選ぶと、上げたあとで
 * 表題欄と寸法を仕様へ反映する（読めた欄だけ上書き）。
 */
function AddFilesModal({
  opened,
  onClose,
  onDone,
  version: v,
  productTypes,
  itemDefs,
}: {
  opened: boolean;
  onClose: () => void;
  onDone: () => void;
  version: DesignVersionView;
  productTypes: ResolvedProductType[];
  itemDefs: ProductItemDef[];
}) {
  const tr = useTranslations();
  const [files, setFiles] = useState<VersionFileSlotState>(EMPTY_FILE_SLOTS);
  const [reading, setReading] = useState<
    SxfDrawingReading | "unreadable" | null
  >(null);
  const [busy, setBusy] = useState(false);

  const taken = [...new Set(v.files.map((f) => f.role))];

  const reset = () => {
    setFiles(EMPTY_FILE_SLOTS);
    setReading(null);
  };

  const upload = async () => {
    setBusy(true);
    try {
      const body = new FormData();
      appendFileSlots(body, files);
      const res = await fetch(
        `/api/design-files/versions/${encodeURIComponent(v.id)}/files`,
        { method: "POST", body },
      );
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        notifications.show({
          title: tr("common.error2"),
          message:
            json?.error ?? tr("production.designFiles.couldNotRegisterIt"),
          color: "red",
        });
        return;
      }
      // 図面から読めたものを仕様へ反映する（読めた欄だけ上書き）。
      if (reading && reading !== "unreadable") {
        const base = initialDesignSpecState(v, productTypes, itemDefs);
        const { state } = applySxfReading(
          base,
          reading,
          productTypes,
          itemDefs,
        );
        const saved = await updateDesignVersion(
          v.id,
          toVersionSpecPayload(state, productTypes),
        );
        if (!saved.ok) {
          notifications.show({
            title: tr("production.designVersion.sxfApplyFailed"),
            message: saved.error,
            color: "orange",
          });
        }
      }
      notifications.show({
        title: tr("common.registered"),
        message: tr("production.designVersion.filesAdded"),
        color: "green",
      });
      reset();
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      confirmDisabled={!hasAnyFile(files)}
      confirmLabel={tr("production.designVersion.addFiles")}
      loading={busy}
      onClose={() => {
        reset();
        onClose();
      }}
      onConfirm={upload}
      opened={opened}
      size="lg"
      title={tr("production.designVersion.addFiles")}
    >
      {reading && (
        <SxfReadNotice
          customerMatched={null}
          filled={
            reading === "unreadable"
              ? 0
              : applySxfReading(
                  initialDesignSpecState(v, productTypes, itemDefs),
                  reading,
                  productTypes,
                  itemDefs,
                ).filled
          }
          onClose={() => setReading(null)}
          reading={reading}
        />
      )}
      <VersionFileSlots
        onChange={setFiles}
        onSxfPicked={async (file) =>
          setReading((await readSxfFile(file)) ?? "unreadable")
        }
        taken={taken}
        value={files}
      />
    </ModalShell>
  );
}
