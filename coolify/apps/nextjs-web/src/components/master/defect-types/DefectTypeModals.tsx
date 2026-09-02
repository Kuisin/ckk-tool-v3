"use client";

/**
 * DefectTypeModals.tsx — 不良種類の編集 / 削除 / 有効・無効切替ポップアップ (MS0A).
 *
 * 詳細ページを持たない小マスタのため、編集は一覧上のモーダルで完結する
 * （コードは識別子のため disabled）。
 */

import { NumberInput, Stack, Switch, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
          title: tr("common.saved2"),
          message: tr("master.defectTypeModals.updated", {
            name: label(target),
          }),
          color: "green",
        });
        resetAndClose();
        onDone?.();
      } else {
        notifications.show({
          title: tr("common.error2"),
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
      submitLabel={tr("common.save2")}
      title={tr("master.defectTypes.editTheDefectType")}
    >
      <Stack gap="sm">
        <TextInput
          description={tr("common.itCannotBeChangedOnceCreated")}
          disabled
          label={tr("master.defectTypeModals.code")}
          readOnly
          value={target?.code ?? ""}
        />
        <LocalizedTextInput
          jaProps={{
            value: nameJa,
            onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
              setNameJa(e.currentTarget.value),
          }}
          label={tr("common.name2")}
          required
          translationsProps={{
            value: nameTranslations,
            onChange: setNameTranslations,
          }}
        />
        <NumberInput
          allowDecimal={false}
          label={tr("common.sortOrder")}
          min={0}
          onChange={setSortOrder}
          value={sortOrder}
        />
        <Switch
          checked={isActive}
          label={tr("common.enabled")}
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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
      loading={isPending}
      message={
        target
          ? tr("master.defectTypeModals.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteDefectTypes([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.defectTypeModals.deleted", {
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
      title={tr("master.defectTypes.deleteTheDefectType")}
      warning={tr("master.defectTypes.itCannotBeDeletedWhileDefect")}
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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={
        isActive
          ? tr("master.defectTypeModals.disableAction")
          : tr("common.enable2")
      }
      loading={isPending}
      message={
        target
          ? isActive
            ? tr("master.defectTypeModals.disableConfirm", {
                name: label(target),
              })
            : tr("master.defectTypeModals.enableConfirm", {
                name: label(target),
              })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setDefectTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.defectTypeModals.disabled", {
                    name: label(target),
                  })
                : tr("master.defectTypeModals.enabled", {
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
          ? tr("master.defectTypeModals.disableTitle")
          : tr("master.defectTypes.enableTheDefectType")
      }
    />
  );
}
