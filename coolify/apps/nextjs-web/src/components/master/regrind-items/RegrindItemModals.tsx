"use client";

/**
 * RegrindItemModals.tsx — 再研磨品目の編集 / 削除 / 有効・無効切替 (MS0H).
 *
 * 詳細ページを持たない小マスタなので、編集は一覧のモーダルで完結する
 * （料金マスタ MS0G と同じ作り）。コードは採番した識別子なので変えられない。
 */

import { Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteRegrindItems,
  setRegrindItemsActive,
  updateRegrindItem,
} from "@/app/(dashboard)/master/regrind-items/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import {
  RegrindItemFields,
  type RegrindItemFieldValues,
} from "./RegrindItemFields";

export interface RegrindItemModalTarget extends RegrindItemFieldValues {
  id: number;
  code: string;
}

function label(t: RegrindItemModalTarget) {
  return t.nameJa ? `${t.nameJa}（${t.code}）` : t.code;
}

/** 編集対象 → フォーム値（id / code はフォームが持たない）。 */
function toValues(t: RegrindItemModalTarget): RegrindItemFieldValues {
  return {
    flutes: t.flutes,
    isActive: t.isActive,
    location: t.location,
    matchNames: t.matchNames,
    nameJa: t.nameJa,
    nameTranslations: t.nameTranslations,
    notes: t.notes,
    sizeMaxMm: t.sizeMaxMm,
    sizeMinMm: t.sizeMinMm,
    standardUnitPrice: t.standardUnitPrice,
    toolClass: t.toolClass,
    unit: t.unit,
  };
}

export function EditRegrindItemModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: RegrindItemModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<RegrindItemFieldValues | null>(null);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // 編集対象が変わるたびに現在値を流し込む（料金マスタと同じ作法）。
  if (opened && target && seededFrom !== target.id) {
    setSeededFrom(target.id);
    setValues(toValues(target));
  }

  const resetAndClose = () => {
    setSeededFrom(null);
    setValues(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target || !values || !values.nameJa.trim()) return;
    startTransition(async () => {
      const result = await updateRegrindItem(target.id, values);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("master.regrindItems.updated", { name: label(target) }),
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
      size="lg"
      submitLabel={tr("common.save2")}
      title={tr("master.regrindItems.editTheRegrindItem")}
    >
      <Stack gap="sm">
        <TextInput
          description={tr("common.itCannotBeChangedOnceCreated")}
          disabled
          label={tr("common.code")}
          readOnly
          value={target?.code ?? ""}
        />
        {values && (
          <RegrindItemFields
            onChange={(part) => setValues((v) => (v ? { ...v, ...part } : v))}
            values={values}
          />
        )}
      </Stack>
    </FormModal>
  );
}

export function DeleteRegrindItemModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: RegrindItemModalTarget | null;
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
          ? tr("master.regrindItems.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteRegrindItems([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.regrindItems.deleted", {
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
      title={tr("master.regrindItems.deleteTheRegrindItem")}
      warning={tr("master.regrindItems.itCannotBeDeletedWhileInUse")}
    />
  );
}

export function ToggleRegrindItemActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: RegrindItemModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? tr("common.disable") : tr("common.enable2")}
      loading={isPending}
      message={
        target
          ? isActive
            ? tr("master.regrindItems.disableConfirm", { name: label(target) })
            : tr("master.regrindItems.enableConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setRegrindItemsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.regrindItems.disabled", { name: label(target) })
                : tr("master.regrindItems.enabled", { name: label(target) }),
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
          ? tr("master.regrindItems.disableTheRegrindItem")
          : tr("master.regrindItems.enableTheRegrindItem")
      }
    />
  );
}
