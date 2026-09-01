"use client";

/**
 * ProcessStepModals.tsx — 工程マスタの削除 / 有効・無効切替ポップアップ (MS08).
 *
 * 削除は「他の工程がこの工程に依存していないこと」がサーバー側の前提条件
 * （actions.ts の deleteProcessSteps ガード）。
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deleteProcessSteps,
  setProcessStepsActive,
} from "@/app/(dashboard)/master/process-steps/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export interface ProcessStepModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: ProcessStepModalTarget) {
  return t.name ? `${t.name}（${t.code}）` : t.code;
}

export function DeleteProcessStepModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProcessStepModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target
          ? tr("master.processSteps.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteProcessSteps([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.processSteps.deleted", {
                name: label(target),
              }),
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("master.processSteps.deleteTheStep")}
      warning={tr("master.processSteps.itCannotBeDeletedWhileOther")}
    />
  );
}

export function ToggleProcessStepActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProcessStepModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={
        isActive ? tr("common.disableAction") : tr("common.enable2")
      }
      loading={isPending}
      message={
        target
          ? isActive
            ? tr("master.processSteps.disableConfirm", {
                name: label(target),
              })
            : tr("master.processSteps.enableConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setProcessStepsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.processSteps.disabled", { name: label(target) })
                : tr("master.processSteps.enabled", { name: label(target) }),
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={
        isActive
          ? tr("master.processSteps.disableTheStep")
          : tr("master.processSteps.enableTheStep")
      }
    />
  );
}
