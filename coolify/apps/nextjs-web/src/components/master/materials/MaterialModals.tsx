"use client";

/**
 * MaterialModals.tsx — 素材の削除 / 有効・無効切替ポップアップ (MS06).
 *
 * 複製モーダルは廃止 — 素材コードは構成（材種×黒皮研磨×径×全長）から一意に
 * 決まるため、類似素材は新規作成ビルダーで構成を変えて作る。
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deleteMaterials,
  setMaterialsActive,
} from "@/app/(dashboard)/master/materials/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export interface MaterialModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: MaterialModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.code}）` : t.code;
}

export function DeleteMaterialModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MaterialModalTarget | null;
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
          ? tr("master.materialModals.deleteConfirmMessage", {
              name: label(target),
            })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteMaterials([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.materialModals.deletedMessage", {
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
      title={tr("master.materials.deleteTheMaterial")}
      warning={tr("master.materials.itCannotBeDeletedWhileProducts")}
    />
  );
}

export function ToggleMaterialActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MaterialModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={
        isActive ? tr("master.materialNumbering.disable") : tr("common.enable2")
      }
      loading={isPending}
      message={
        target
          ? isActive
            ? tr("master.materialModals.disableConfirmMessage", {
                name: label(target),
              })
            : tr("master.materialModals.enableConfirmMessage", {
                name: label(target),
              })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.materialModals.disabledMessage", {
                    name: label(target),
                  })
                : tr("master.materialModals.enabledMessage", {
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
      title={
        isActive
          ? tr("master.materialModals.disableTheMaterial")
          : tr("master.materials.enableTheMaterial")
      }
    />
  );
}
