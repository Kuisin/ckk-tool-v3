"use client";

/**
 * ChargeItemModals.tsx — 料金マスタの編集 / 削除 / 有効・無効切替 (MS0G).
 *
 * 詳細ページを持たない小マスタなので、編集は一覧のモーダルで完結する
 * （コードは識別子なので disabled — 不良種類 MS0A と同じ作り）。
 */

import { Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  deleteChargeItems,
  setChargeItemsActive,
  updateChargeItem,
} from "@/app/(dashboard)/master/charge-items/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import {
  ChargeItemFields,
  type ChargeItemFieldValues,
} from "./ChargeItemFields";

export interface ChargeItemModalTarget extends ChargeItemFieldValues {
  id: number;
  code: string;
}

function label(t: ChargeItemModalTarget) {
  return t.nameJa ? `${t.nameJa}（${t.code}）` : t.code;
}

export function EditChargeItemModal({
  opened,
  onClose,
  target,
  onDone,
  taxCategoryOptions,
}: ModalBaseProps & {
  target: ChargeItemModalTarget | null;
  onDone?: () => void;
  taxCategoryOptions: { value: string; label: string }[];
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState<ChargeItemFieldValues | null>(null);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // 編集対象が変わるたびに現在値を流し込む（DefectType と同じ作法）。
  if (opened && target && seededFrom !== target.id) {
    setSeededFrom(target.id);
    setValues({
      amountMode: target.amountMode,
      defaultAmount: target.defaultAmount,
      isActive: target.isActive,
      nameJa: target.nameJa,
      nameTranslations: target.nameTranslations,
      notes: target.notes,
      sortOrder: target.sortOrder,
      taxCategoryId: target.taxCategoryId,
    });
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
      const result = await updateChargeItem(target.id, {
        ...values,
        code: target.code,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("master.chargeItems.updated", { name: label(target) }),
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
      title={tr("master.chargeItems.editTheChargeItem")}
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
          <ChargeItemFields
            onChange={(part) => setValues((v) => (v ? { ...v, ...part } : v))}
            taxCategoryOptions={taxCategoryOptions}
            values={values}
          />
        )}
      </Stack>
    </FormModal>
  );
}

export function DeleteChargeItemModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ChargeItemModalTarget | null;
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
          ? tr("master.chargeItems.deleteConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteChargeItems([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("master.chargeItems.deleted", {
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
      title={tr("master.chargeItems.deleteTheChargeItem")}
      warning={tr("master.chargeItems.itCannotBeDeletedWhileInUse")}
    />
  );
}

export function ToggleChargeItemActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ChargeItemModalTarget | null;
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
            ? tr("master.chargeItems.disableConfirm", { name: label(target) })
            : tr("master.chargeItems.enableConfirm", { name: label(target) })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setChargeItemsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("master.chargeItems.disabled", { name: label(target) })
                : tr("master.chargeItems.enabled", { name: label(target) }),
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
          ? tr("master.chargeItems.disableTheChargeItem")
          : tr("master.chargeItems.enableTheChargeItem")
      }
    />
  );
}
