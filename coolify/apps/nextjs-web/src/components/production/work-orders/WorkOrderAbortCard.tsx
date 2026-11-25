"use client";

/**
 * 指示書の打ち切り — 申請フォーム（モーダル）と、状態のカード
 * （_specs/design.md §10.9 ActionCard）。
 *
 * - 申請: 流れの途中で良品がいる位置ごとに、戻す数（残りは廃棄 — 明示）・
 *   加工状態（合流の後で曖昧なときだけ選ぶ。推奨 = 本流）・仕上がり寸法・
 *   理由（必須）を入れる。規則は lib/wip-abort-core.ts validateAbortRequest で、
 *   サーバーが同じ関数で再検証する。
 * - カード: 承認依頼中（承認できる人は green + 承認 / 差し戻し、それ以外は
 *   gray）/ 打ち切り済み / 適用できなかった（red）。
 */

import {
  Badge,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlayerStop } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import {
  approveWorkOrderAbort,
  rejectWorkOrderAbort,
  requestWorkOrderAbort,
} from "@/app/(dashboard)/production/work-orders/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { ActionCard } from "@/components/ui/ActionCard";
import { ApproveButton, RejectButton } from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import type { ApprovalActionState } from "@/lib/approvals";
import {
  type AbortIssue,
  type AbortPositionInput,
  defaultAbortInputs,
  validateAbortRequest,
} from "@/lib/wip-abort-core";
import { wipPathOptions, wipSignature } from "@/lib/wip-state-core";
import type {
  AbortFormView,
  WorkOrderAbortView,
} from "@/lib/work-order-aborts";

// ─── 申請フォーム ───────────────────────────────────────────────────────────

export function WorkOrderAbortModal({
  opened,
  onClose,
  form,
  workOrderNumber,
}: {
  opened: boolean;
  onClose: () => void;
  form: AbortFormView;
  workOrderNumber: number;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [inputs, setInputs] = useState<AbortPositionInput[]>(() =>
    defaultAbortInputs(form.positions),
  );

  const check = useMemo(
    () =>
      validateAbortRequest({
        positions: form.positions,
        reason,
        inputs,
        blank: form.blank,
      }),
    [form.positions, form.blank, reason, inputs],
  );

  const stepName = (stepId: string | null) => {
    if (!stepId) return "—";
    const pid = form.stepProcessIds[stepId];
    return pid != null ? (form.stepNames[pid] ?? `#${pid}`) : "—";
  };
  const stateLabel = (stepIds: readonly number[]) =>
    stepIds.length === 0
      ? tr("production.wipRecording.stateUnprocessed")
      : stepIds.map((id) => form.stepNames[id] ?? `#${id}`).join(" → ");
  const toNumber = (v: string | number): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const update = (key: string, patch: Partial<AbortPositionInput>) =>
    setInputs((prev) =>
      prev.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  const issueText = (issue: AbortIssue) => {
    switch (issue.kind) {
      case "reasonRequired":
        return tr("production.workOrderAbort.reasonRequired");
      case "wip":
        return tr(`production.wipRecording.issues.${issue.issue}`);
      case "positionMissing":
      case "positionUnknown":
        return tr("production.workOrderAbort.positionsChanged");
      default:
        return tr("production.workOrderAbort.quantityMismatch");
    }
  };

  const submit = () => {
    startTransition(async () => {
      const result = await requestWorkOrderAbort(
        workOrderNumber,
        reason,
        inputs,
      );
      if (result.ok) {
        notifications.show({
          title: result.data?.applied
            ? tr("production.workOrderAbort.appliedToast")
            : tr("production.workOrderAbort.requestedToast"),
          message: result.data?.applied
            ? tr("production.workOrderAbort.appliedToastMessage")
            : tr("production.workOrderAbort.requestedToastMessage"),
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

  return (
    <ModalShell
      confirmColor="red"
      confirmDisabled={check.issues.length > 0}
      confirmLabel={tr("production.workOrderAbort.confirm")}
      loading={isPending}
      onClose={onClose}
      onConfirm={submit}
      opened={opened}
      size="lg"
      title={tr("production.workOrderAbort.title")}
    >
      <Text size="sm">{tr("production.workOrderAbort.description")}</Text>
      {form.positions.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("production.workOrderAbort.noPositions")}
        </Text>
      ) : (
        form.positions.map((pos) => {
          const input = inputs.find((i) => i.key === pos.key);
          if (!input) return null;
          const options = wipPathOptions(pos.path);
          const chosen = input.pathStepIds ?? pos.path.stepIds;
          const chosenIndex = Math.max(
            0,
            options.findIndex((o) => wipSignature(o) === wipSignature(chosen)),
          );
          const shaped = chosen.length > 0;
          const returning = input.returnQuantity > 0;
          const positionIssues = check.issues.filter(
            (i) => "key" in i && i.key === pos.key,
          );
          return (
            <Paper key={pos.key} p="sm" radius="sm" withBorder>
              <Stack gap="xs">
                <Group gap="xs" justify="space-between" wrap="wrap">
                  <Group gap="xs" wrap="wrap">
                    <Badge
                      color={pos.kind === "IN_STEP" ? "blue" : "gray"}
                      variant="light"
                    >
                      {pos.kind === "IN_STEP"
                        ? tr("production.workOrderAbort.inStep")
                        : tr("production.workOrderAbort.waiting")}
                    </Badge>
                    <Text fw={600} size="sm">
                      {pos.kind === "IN_STEP"
                        ? stepName(pos.stepId)
                        : tr("production.workOrderAbort.waitingBetween", {
                            from: stepName(pos.sourceStepId),
                            to: stepName(pos.stepId),
                          })}
                    </Text>
                  </Group>
                  <Text
                    size="sm"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {tr("production.workOrderAbort.atPosition", {
                      quantity: pos.quantity,
                    })}
                  </Text>
                </Group>
                <Text c="dimmed" size="xs">
                  {tr("production.wipRecording.state")}:{" "}
                  {stateLabel(options[chosenIndex] ?? [])}
                </Text>
                {pos.path.ambiguous && returning && (
                  <Select
                    allowDeselect={false}
                    data={options.map((stepIds, i) => ({
                      value: String(i),
                      label:
                        i === 0
                          ? `${stateLabel(stepIds)} — ${tr("production.wipRecording.recommended")}`
                          : stateLabel(stepIds),
                    }))}
                    description={tr("production.wipRecording.pathHint")}
                    label={tr("production.wipRecording.path")}
                    onChange={(v) =>
                      v != null &&
                      update(pos.key, {
                        pathStepIds: [...(options[Number(v)] ?? [])],
                      })
                    }
                    value={String(chosenIndex)}
                    withAsterisk
                  />
                )}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                  <NumberInput
                    allowDecimal={false}
                    allowNegative={false}
                    label={tr("production.workOrderAbort.returnQuantity")}
                    max={pos.quantity}
                    min={0}
                    onChange={(v) => {
                      const n = Math.min(
                        pos.quantity,
                        Math.max(0, Math.trunc(toNumber(v) ?? 0)),
                      );
                      update(pos.key, {
                        returnQuantity: n,
                        scrapQuantity: pos.quantity - n,
                      });
                    }}
                    value={input.returnQuantity}
                    withAsterisk
                  />
                  <NumberInput
                    description={tr("production.workOrderAbort.scrapHint")}
                    label={tr("production.workOrderAbort.scrapQuantity")}
                    readOnly
                    value={input.scrapQuantity}
                    variant="filled"
                  />
                </SimpleGrid>
                {returning && (
                  <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <NumberInput
                      allowNegative={false}
                      decimalScale={3}
                      label={tr("production.wipRecording.finishedDiameter")}
                      min={0}
                      onChange={(v) =>
                        update(pos.key, { finishedDiameterMm: toNumber(v) })
                      }
                      placeholder={
                        !shaped && form.blank
                          ? String(form.blank.diameterMm)
                          : undefined
                      }
                      value={input.finishedDiameterMm ?? ""}
                      withAsterisk={shaped}
                    />
                    <NumberInput
                      allowNegative={false}
                      decimalScale={3}
                      label={tr("production.wipRecording.finishedLength")}
                      min={0}
                      onChange={(v) =>
                        update(pos.key, { finishedLengthMm: toNumber(v) })
                      }
                      placeholder={
                        !shaped && form.blank
                          ? String(form.blank.lengthMm)
                          : undefined
                      }
                      value={input.finishedLengthMm ?? ""}
                      withAsterisk={shaped}
                    />
                  </SimpleGrid>
                )}
                {positionIssues.length > 0 && (
                  <Text c="red" size="xs">
                    {positionIssues.map(issueText).join(" / ")}
                  </Text>
                )}
              </Stack>
            </Paper>
          );
        })
      )}
      <Textarea
        autosize
        label={tr("production.workOrderAbort.reason")}
        minRows={2}
        onChange={(e) => setReason(e.currentTarget.value)}
        placeholder={tr("production.workOrderAbort.reasonPlaceholder")}
        value={reason}
        withAsterisk
      />
      <Text c="dimmed" size="xs">
        {tr("production.workOrderAbort.approvalNote")}
      </Text>
    </ModalShell>
  );
}

// ─── 状態のカード ───────────────────────────────────────────────────────────

export function WorkOrderAbortCard({
  abort,
  approval,
}: {
  abort: WorkOrderAbortView | null;
  /** 保留中の申請の承認状態（保留中でなければ null）。 */
  approval: ApprovalActionState | null;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (!abort) return null;
  const icon = <IconPlayerStop size={20} />;

  if (abort.status === "APPLIED") {
    return (
      <ActionCard
        description={tr("production.workOrderAbort.appliedDescription", {
          at: abort.appliedAt ? fmt.dateTime(abort.appliedAt) : "—",
          reason: abort.reason,
          returned: abort.returned,
          scrap: abort.scrap,
        })}
        icon={icon}
        title={tr("production.workOrderAbort.appliedTitle")}
        tone="wait"
      />
    );
  }
  if (abort.status === "FAILED") {
    return (
      <ActionCard
        description={tr("production.workOrderAbort.failedDescription", {
          error: abort.error ?? "—",
        })}
        icon={icon}
        title={tr("production.workOrderAbort.failedTitle")}
        tone="alert"
      />
    );
  }
  if (abort.status !== "PENDING" || !approval) return null;

  const canAct = approval.canAct;
  const stepLabel =
    approval.stepCount > 0
      ? `${approval.stepLabel || `#${approval.stepNo}`}（${approval.stepNo}/${approval.stepCount}）`
      : tr("common.pendingApproval");

  const handleApprove = () => {
    startTransition(async () => {
      const result = await approveWorkOrderAbort(abort.id);
      if (result.ok) {
        notifications.show({
          title: result.data?.applied
            ? tr("production.workOrderAbort.appliedToast")
            : tr("common.approved"),
          message: result.data?.applied
            ? tr("production.workOrderAbort.appliedToastMessage")
            : tr("common.passedToTheNextApprover"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotApprove"),
          color: "red",
        });
      }
      router.refresh();
    });
  };

  const handleReject = () => {
    startTransition(async () => {
      const result = await rejectWorkOrderAbort(abort.id, rejectReason);
      if (result.ok) {
        setRejectOpen(false);
        setRejectReason("");
        notifications.show({
          title: tr("common.sentBack"),
          message: tr("production.workOrderAbort.rejectedToastMessage"),
          color: "orange",
        });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error ?? tr("common.couldNotSendItBack"),
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <ActionCard
        actions={
          canAct ? (
            <>
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
              <ApproveButton loading={isPending} onClick={handleApprove} />
            </>
          ) : null
        }
        description={tr("production.workOrderAbort.pendingDescription", {
          reason: abort.reason,
          requestedBy: abort.requestedByName ?? "—",
          returned: abort.returned,
          scrap: abort.scrap,
          stepLabel,
        })}
        icon={icon}
        title={
          canAct
            ? tr("production.workOrderAbort.approvalTitle")
            : tr("production.workOrderAbort.pendingTitle")
        }
        tone={canAct ? "approve" : "wait"}
      />
      <ModalShell
        confirmColor="red"
        confirmDisabled={!rejectReason.trim()}
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={handleReject}
        opened={rejectOpen}
        title={tr("production.workOrderAbort.rejectTitle")}
      >
        <Text size="sm">{tr("production.workOrderAbort.rejectHelp")}</Text>
        <Textarea
          autosize
          label={tr("common.reasonForSendingBack")}
          minRows={3}
          onChange={(e) => setRejectReason(e.currentTarget.value)}
          value={rejectReason}
          withAsterisk
        />
      </ModalShell>
    </>
  );
}
