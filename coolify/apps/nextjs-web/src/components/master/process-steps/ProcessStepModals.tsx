"use client";

/**
 * ProcessStepModals.tsx — 工程マスタの削除 / 有効・無効切替ポップアップ (MS08).
 *
 * 削除は「他の工程がこの工程に依存していないこと」がサーバー側の前提条件
 * （actions.ts の deleteProcessSteps ガード）。
 */

import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import {
  deleteProcessSteps,
  setProcessStepsActive,
} from "@/app/(dashboard)/master/process-steps/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
      loading={isPending}
      message={
        target
          ? tr("工程「{v0}」を削除します。この操作は取り消せません。", {
              v0: label(target),
            })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteProcessSteps([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: tr("工程「{v0}」を削除しました", { v0: label(target) }),
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={tr("工程の削除")}
      warning={tr(
        tr(
          tr(
            "他の工程がこの工程に依存している場合や、検査表テンプレート・指示書が参照している場合は削除できません。無効化をご検討ください。",
          ),
        ),
      )}
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : tr("有効化する")}
      loading={isPending}
      message={
        target
          ? isActive
            ? tr(
                "工程「{v0}」を無効化します。新規のワークフロー・依存先として選択できなくなります。",
                { v0: label(target) },
              )
            : tr(
                "工程「{v0}」を有効化します。再びワークフロー・依存先として選択できるようになります。",
                { v0: label(target) },
              )
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setProcessStepsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: tr("工程「{v0}」を{v1}しました", {
                v0: label(target),
                v1: isActive ? "無効化" : "有効化",
              }),
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(result.error),
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={isActive ? "工程の無効化" : tr("工程の有効化")}
    />
  );
}
