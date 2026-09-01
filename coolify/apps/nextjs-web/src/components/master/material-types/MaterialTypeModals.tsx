"use client";

/**
 * MaterialTypeModals.tsx — 材種の削除 / 有効・無効切替ポップアップ (MS05).
 *
 * Ported from design-preview (designs/master/material-types/_modals) and wired
 * to the Server Actions. Both call back `onDone` (e.g. router.refresh or
 * redirect) after a successful mutation.
 */

import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import {
  deleteMaterialTypes,
  setMaterialTypesActive,
} from "@/app/(dashboard)/master/material-types/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

export interface MaterialTypeModalTarget {
  id: number;
  name: string;
  isActive: boolean;
}

function label(t: MaterialTypeModalTarget) {
  return t.name !== "—" ? t.name : `#${t.id}`;
}

export function DeleteMaterialTypeModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MaterialTypeModalTarget | null;
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
          ? tr("材種「{v0}」を削除します。この操作は取り消せません。", {
              v0: label(target),
            })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteMaterialTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: tr("材種「{v0}」を削除しました", { v0: label(target) }),
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
      title={tr("材種の削除")}
      warning={tr(
        tr(
          tr(
            "この材種に紐づく素材が存在する場合は削除できません。無効化をご検討ください。",
          ),
        ),
      )}
    />
  );
}

export function ToggleMaterialTypeActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MaterialTypeModalTarget | null;
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
                "材種「{v0}」を無効化します。新規の素材登録で選択できなくなります。",
                { v0: label(target) },
              )
            : tr(
                "材種「{v0}」を有効化します。再び素材登録で選択できるようになります。",
                { v0: label(target) },
              )
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: tr("材種「{v0}」を{v1}しました", {
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
      title={isActive ? "材種の無効化" : tr("材種の有効化")}
    />
  );
}
