"use client";

/**
 * PlantModals.tsx — 拠点の削除 / 有効・無効切替ポップアップ (MS0C).
 *
 * 拠点コードは作成後不変のため複製モーダルは持たない（類似拠点は新規作成で
 * コードを変えて登録する）。
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deletePlants,
  setPlantsActive,
} from "@/app/(dashboard)/master/plants/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export interface PlantModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: PlantModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.code}）` : t.code;
}

export function DeletePlantModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: PlantModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target ? tr("master.plants.deleteConfirm", { name: label(target) }) : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deletePlants([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.plants.deleted", { name: label(target) }),
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
      title={tr("master.plants.deleteTheSite")}
      warning={tr("master.plants.itCannotBeDeletedWhileStock")}
    />
  );
}

export function TogglePlantActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: PlantModalTarget | null;
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
            ? tr("master.plants.disableConfirm", { name: label(target) })
            : tr("master.plants.enableConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setPlantsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.plants.disabled", { name: label(target) })
                : tr("master.plants.enabled", { name: label(target) }),
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
          ? tr("master.plants.disableTheSite")
          : tr("master.plants.enableTheSite")
      }
    />
  );
}
