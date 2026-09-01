"use client";

/**
 * DefectTypeModals.tsx — 不良種類の編集 / 削除 / 有効・無効切替ポップアップ (MS0A).
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
import { LocalizedTextInput } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";

export interface DefectTypeModalTarget {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();

  const [nameJa, setNameJa] = useState("");
  const [nameTranslations, setNameTranslations] = useState<
    Record<string, string>
  >({});
  const [sortOrder, setSortOrder] = useState<number | string>(0);
  const [isActive, setIsActive] = useState(true);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // 編集対象が変わるたびにフィールドへ現在値を流し込む。
  if (opened && target && seededFrom !== target.id) {
    setSeededFrom(target.id);
    setNameJa(target.nameJa);
    setNameTranslations(target.nameTranslations);
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
        nameTranslations,
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isActive,
      });
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: tr("不良種類「{v0}」を更新しました", { v0: label(target) }),
          color: "green",
        });
        resetAndClose();
        onDone?.();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
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
      submitLabel={tr("保存")}
      title={tr("不良種類の編集")}
    >
      <Stack gap="sm">
        <TextInput
          description={tr("作成後は変更できません")}
          disabled
          label="コード"
          readOnly
          value={target?.code ?? ""}
        />
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setNameJa(e.currentTarget.value),
          }}
          label={tr("名称")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <NumberInput
          allowDecimal={false}
          label={tr("表示順")}
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
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("削除する")}
      loading={isPending}
      message={
        target
          ? tr("不良種類「{v0}」を削除します。この操作は取り消せません。", {
              v0: label(target),
            })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteDefectTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: tr("不良種類「{v0}」を削除しました", {
                v0: label(target),
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
      title={tr("不良種類の削除")}
      warning={tr(
        tr(
          tr(
            "この不良種類を参照する不良記録が存在する場合は削除できません。無効化をご検討ください。",
          ),
        ),
      )}
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
                "不良種類「{v0}」を無効化します。新規の不良記録で選択できなくなります。",
                { v0: label(target) },
              )
            : tr(
                "不良種類「{v0}」を有効化します。再び不良記録で選択できるようになります。",
                { v0: label(target) },
              )
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setDefectTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("有効化しました"),
              message: tr("不良種類「{v0}」を{v1}しました", {
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
      title={isActive ? "不良種類の無効化" : tr("不良種類の有効化")}
    />
  );
}
