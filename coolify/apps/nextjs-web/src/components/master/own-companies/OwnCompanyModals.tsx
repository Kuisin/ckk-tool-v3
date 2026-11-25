"use client";

/**
 * OwnCompanyModals.tsx — 自社法人の削除 / 有効・無効切替ポップアップ (MS0I).
 *
 * 既定の法人は削除も無効化もできない（サーバー側でも拒否する）。コードは
 * 作成後不変なので複製モーダルは持たない。
 */

import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import {
  deleteOwnCompany,
  setOwnCompanyActive,
} from "@/app/(dashboard)/master/own-companies/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export interface OwnCompanyModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: OwnCompanyModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.code}）` : t.code;
}

export function DeleteOwnCompanyModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: OwnCompanyModalTarget | null;
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
          ? tr("master.ownCompanies.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteOwnCompany(target.id);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.ownCompanies.deleted"),
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
      title={tr("master.ownCompanies.deleteTitle")}
      warning={tr("master.ownCompanies.deleteWarning")}
    />
  );
}

export function ToggleOwnCompanyActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: OwnCompanyModalTarget | null;
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
            ? tr("master.ownCompanies.disableConfirm", { name: label(target) })
            : tr("master.ownCompanies.enableConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setOwnCompanyActive(target.id, !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: tr("master.ownCompanies.updated"),
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
          ? tr("master.ownCompanies.disableTitle")
          : tr("master.ownCompanies.enableTitle")
      }
    />
  );
}
