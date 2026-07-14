"use client";

/**
 * DefectTypeModals.tsx — 不良種類の編集 / 削除 / 有効・無効切替ポップアップ (MS09).
 *
 * 詳細ページを持たない小マスタのため、編集は一覧上のモーダルで完結する
 * （コードは識別子のため disabled）。
 */

import { NumberInput, Stack, Switch, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState, useTransition } from "react";
import {
  deleteDefectTypes,
  setDefectTypesActive,
  updateDefectType,
} from "@/app/(dashboard)/master/defect-types/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";

export interface DefectTypeModalTarget {
  id: number;
  code: string;
  nameJa: string;
  nameEn: string;
  sortOrder: number;
  isActive: boolean;
}

function label(t: DefectTypeModalTarget) {
  return t.nameJa ? `${t.nameJa}（${t.code}）` : t.code;
}

export function EditDefectTypeModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: DefectTypeModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sortOrder, setSortOrder] = useState<number | string>(0);
  const [isActive, setIsActive] = useState(true);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // 編集対象が変わるたびにフィールドへ現在値を流し込む。
  if (opened && target && seededFrom !== target.id) {
    setSeededFrom(target.id);
    setNameJa(target.nameJa);
    setNameEn(target.nameEn);
    setSortOrder(target.sortOrder);
    setIsActive(target.isActive);
  }

  const resetAndClose = () => {
    setSeededFrom(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target || !nameJa.trim()) return;
    startTransition(async () => {
      const result = await updateDefectType(target.id, {
        code: target.code,
        nameJa,
        nameEn,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isActive,
      });
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `不良種類「${label(target)}」を更新しました`,
          color: "green",
        });
        resetAndClose();
        onDone?.();
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <FormModal
      loading={isPending}
      onClose={resetAndClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel="保存"
      title="不良種類の編集"
    >
      <Stack gap="sm">
        <TextInput
          description="作成後は変更できません"
          disabled
          label="コード"
          readOnly
          value={target?.code ?? ""}
        />
        <TextInput
          label="名称（日本語）"
          onChange={(e) => setNameJa(e.currentTarget.value)}
          value={nameJa}
          withAsterisk
        />
        <TextInput
          label="名称（English）"
          onChange={(e) => setNameEn(e.currentTarget.value)}
          value={nameEn}
        />
        <NumberInput
          allowDecimal={false}
          label="表示順"
          min={0}
          onChange={setSortOrder}
          value={sortOrder}
        />
        <Switch
          checked={isActive}
          label="有効"
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}

export function DeleteDefectTypeModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: DefectTypeModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `不良種類「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteDefectTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `不良種類「${label(target)}」を削除しました`,
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
      title="不良種類の削除"
      warning="この不良種類を参照する不良記録が存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}

export function ToggleDefectTypeActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: DefectTypeModalTarget | null;
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
            ? `不良種類「${label(target)}」を無効化します。新規の不良記録で選択できなくなります。`
            : `不良種類「${label(target)}」を有効化します。再び不良記録で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setDefectTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `不良種類「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={isActive ? "不良種類の無効化" : "不良種類の有効化"}
    />
  );
}
