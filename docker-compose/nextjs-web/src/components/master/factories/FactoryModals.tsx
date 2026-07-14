"use client";

/**
 * FactoryModals.tsx — 工場の削除 / 有効・無効切替ポップアップ (MS0B).
 *
 * 工場コードは作成後不変のため複製モーダルは持たない（類似拠点は新規作成で
 * コードを変えて登録する）。
 */

import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import {
  deleteFactories,
  setFactoriesActive,
} from "@/app/(dashboard)/master/factories/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";

export interface FactoryModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: FactoryModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.code}）` : t.code;
}

export function DeleteFactoryModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: FactoryModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `工場「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteFactories([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `工場「${label(target)}」を削除しました`,
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
      title="工場の削除"
      warning="この工場を参照する在庫・工程データが存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}

export function ToggleFactoryActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: FactoryModalTarget | null;
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
            ? `工場「${label(target)}」を無効化します。新規の在庫・出荷・工程で選択できなくなります。`
            : `工場「${label(target)}」を有効化します。再び在庫・出荷・工程で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setFactoriesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `工場「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={isActive ? "工場の無効化" : "工場の有効化"}
    />
  );
}
