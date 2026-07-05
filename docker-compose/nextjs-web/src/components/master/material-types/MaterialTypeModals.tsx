"use client";

/**
 * MaterialTypeModals.tsx — 材種の削除 / 有効・無効切替ポップアップ (MS04).
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

export interface MaterialTypeModalTarget {
  id: string;
  name: string;
  isActive: boolean;
}

function label(t: MaterialTypeModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.id}）` : t.id;
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
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `材種「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteMaterialTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `材種「${label(target)}」を削除しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title="材種の削除"
      warning="この材種に紐づく素材が存在する場合は削除できません。無効化をご検討ください。"
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
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : "有効化する"}
      loading={isPending}
      message={
        target
          ? isActive
            ? `材種「${label(target)}」を無効化します。新規の素材登録で選択できなくなります。`
            : `材種「${label(target)}」を有効化します。再び素材登録で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `材種「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
              color: "green",
            });
            onDone?.();
          } else {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
          }
        });
      }}
      opened={opened}
      title={isActive ? "材種の無効化" : "材種の有効化"}
    />
  );
}
