"use client";

/**
 * MaterialTypeModals.tsx — 材種の削除 / 有効・無効切替ポップアップ (MS05).
 *
 * Ported from design-preview (designs/master/material-types/_modals) and wired
 * to the Server Actions. Both call back `onDone` (e.g. router.refresh or
 * redirect) after a successful mutation.
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deleteMaterialTypes,
  setMaterialTypesActive,
} from "@/app/(dashboard)/master/material-types/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target
          ? tr("master.materialTypes.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteMaterialTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.materialTypes.deleted", {
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
      title={tr("master.materialTypes.deleteTheMaterialType")}
      warning={tr("master.materialTypes.itCannotBeDeletedWhileMaterials")}
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
            ? tr("master.materialTypes.disableConfirm", {
                name: label(target),
              })
            : tr("master.materialTypes.enableConfirm", {
                name: label(target),
              })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.materialTypes.disabled", { name: label(target) })
                : tr("master.materialTypes.enabled", { name: label(target) }),
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
          ? tr("master.materialTypes.disableTheMaterialType")
          : tr("master.materialTypes.enableTheMaterialType")
      }
    />
  );
}
