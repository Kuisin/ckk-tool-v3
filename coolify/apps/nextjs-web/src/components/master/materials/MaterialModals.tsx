"use client";

/**
 * MaterialModals.tsx — 素材の削除 / 有効・無効切替ポップアップ (MS06).
 *
 * 複製モーダルは廃止 — 素材コードは構成（材種×黒皮研磨×径×全長）から一意に
 * 決まるため、類似素材は新規作成ビルダーで構成を変えて作る。
 */

import { notifications } from "@mantine/notifications";
import { useTransition } from "react";
import {
  deleteMaterials,
  setMaterialsActive,
} from "@/app/(dashboard)/master/materials/actions";
import { ConfirmModal, type ModalBaseProps } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
      loading={isPending}
      message={
        target
          ? tr("素材「{v0}」を削除します。この操作は取り消せません。", {
              v0: label(target),
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
              title: tr("削除しました"),
              message: tr("素材「{v0}」を削除しました", { v0: label(target) }),
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
      title={tr("素材の削除")}
      warning={tr(
        tr(
          tr(
            "この素材を参照する製品・発注・在庫が存在する場合は削除できません。無効化をご検討ください。",
          ),
        ),
      )}
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
                "素材「{v0}」を無効化します。新規の発注・指示書で選択できなくなります。",
                { v0: label(target) },
              )
            : tr(
                "素材「{v0}」を有効化します。再び発注・指示書で選択できるようになります。",
                { v0: label(target) },
              )
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: tr("素材「{v0}」を{v1}しました", {
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
      title={isActive ? "素材の無効化" : tr("素材の有効化")}
    />
  );
}
