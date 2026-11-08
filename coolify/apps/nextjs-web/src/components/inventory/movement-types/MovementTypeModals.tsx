"use client";

/**
 * MovementTypeModals.tsx — 移動タイプの新規作成 / 編集 / 有効・無効切替 (ST09).
 *
 * 詳細ページを持たない小マスタのため、新規作成・編集ともに一覧上のモーダルで
 * 完結する（コードは編集時のみ識別子として disabled — 新規作成時は入力可）。
 *
 * **向きが決める下限は黙って強制しない**（lib/movement-type-core.ts
 * `requiredEndpoints`）。利用者が 出庫元要 / 入庫先要 を自由に触れる代わりに、
 * 下限を割る組み合わせでは保存前にオレンジの注記を出し、保存ボタンを止める —
 * サーバー側（actions.ts）も同じ `isValidRule` で断るので、画面を迂回しても
 * 矛盾した設定は保存できない。
 */

import {
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createMovementType,
  setMovementTypesActive,
  updateMovementType,
} from "@/app/(dashboard)/inventory/movement-types/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { LocalizedTextInput } from "@/components/ui/shells";
import { movementDirectionOptions } from "@/lib/enum-labels";
import type { Locale } from "@/lib/i18n";
import {
  type MovementDirection,
  requiredEndpoints,
} from "@/lib/movement-type-core";

export interface MovementTypeModalTarget {
  id: number;
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  direction: MovementDirection;
  requiresFrom: boolean;
  requiresTo: boolean;
  sortOrder: number;
  isActive: boolean;
  notes: string | null;
}

function label(t: MovementTypeModalTarget) {
  return t.nameJa ? `${t.nameJa}（${t.code}）` : t.code;
}

interface MovementTypeDraft {
  code: string;
  nameJa: string;
  nameTranslations: Record<string, string>;
  direction: MovementDirection;
  requiresFrom: boolean;
  requiresTo: boolean;
  sortOrder: number | string;
  isActive: boolean;
  notes: string;
}

const EMPTY_DRAFT: MovementTypeDraft = {
  code: "",
  nameJa: "",
  nameTranslations: {},
  direction: "IN",
  requiresFrom: false,
  requiresTo: true,
  sortOrder: 0,
  isActive: true,
  notes: "",
};

/**
 * 共通フィールド。`codeEditable=false`（編集時）はコードを識別子として
 * 読み取り専用にする。向きの下限違反は `floorProblem` に文字列で渡す
 * （渡された側が保存を止める）。
 */
function MovementTypeFields({
  draft,
  onChange,
  codeEditable,
  floorProblem,
}: {
  draft: MovementTypeDraft;
  onChange: (next: MovementTypeDraft) => void;
  codeEditable: boolean;
  floorProblem: string | null;
}) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;

  return (
    <Stack gap="sm">
      <TextInput
        description={
          codeEditable
            ? tr("inventory.movementTypes.codeHint")
            : tr("common.itCannotBeChangedOnceCreated")
        }
        disabled={!codeEditable}
        label={tr("inventory.movementTypes.number")}
        onChange={(e) => onChange({ ...draft, code: e.currentTarget.value })}
        readOnly={!codeEditable}
        value={draft.code}
        withAsterisk
      />
      <LocalizedTextInput
        jaProps={{
          value: draft.nameJa,
          onChange: (e) =>
            onChange({ ...draft, nameJa: e.currentTarget.value }),
        }}
        label={tr("common.name2")}
        required
        translationsProps={{
          value: draft.nameTranslations,
          onChange: (v) => onChange({ ...draft, nameTranslations: v }),
        }}
      />
      <Select
        allowDeselect={false}
        data={movementDirectionOptions(locale)}
        label={tr("inventory.movementTypes.direction")}
        onChange={(v) => {
          if (!v) return;
          onChange({ ...draft, direction: v as MovementDirection });
        }}
        value={draft.direction}
        withAsterisk
      />
      <Switch
        checked={draft.requiresFrom}
        description={
          floorProblem === "from" ? (
            <Text c="orange" component="span" size="xs">
              {tr("inventory.movementTypes.requiresFromFloor")}
            </Text>
          ) : undefined
        }
        label={tr("inventory.movementTypes.requiresFrom")}
        onChange={(e) =>
          onChange({ ...draft, requiresFrom: e.currentTarget.checked })
        }
      />
      <Switch
        checked={draft.requiresTo}
        description={
          floorProblem === "to" ? (
            <Text c="orange" component="span" size="xs">
              {tr("inventory.movementTypes.requiresToFloor")}
            </Text>
          ) : undefined
        }
        label={tr("inventory.movementTypes.requiresTo")}
        onChange={(e) =>
          onChange({ ...draft, requiresTo: e.currentTarget.checked })
        }
      />
      <NumberInput
        allowDecimal={false}
        label={tr("common.sortOrder")}
        min={0}
        onChange={(v) => onChange({ ...draft, sortOrder: v })}
        value={draft.sortOrder}
      />
      <Switch
        checked={draft.isActive}
        label={tr("common.enabled")}
        onChange={(e) =>
          onChange({ ...draft, isActive: e.currentTarget.checked })
        }
      />
      <Textarea
        label={tr("common.notesOptional")}
        onChange={(e) => onChange({ ...draft, notes: e.currentTarget.value })}
        rows={2}
        value={draft.notes}
      />
    </Stack>
  );
}

/** 向きが決める下限を割っているか（"from" | "to" | null）。 */
function floorViolation(draft: MovementTypeDraft): "from" | "to" | null {
  const min = requiredEndpoints(draft.direction);
  if (min.from && !draft.requiresFrom) return "from";
  if (min.to && !draft.requiresTo) return "to";
  return null;
}

export function CreateMovementTypeModal({
  opened,
  onClose,
  onDone,
}: ModalBaseProps & { onDone?: () => void }) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MovementTypeDraft>(EMPTY_DRAFT);

  const resetAndClose = () => {
    setDraft(EMPTY_DRAFT);
    onClose();
  };

  const problem = floorViolation(draft);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!draft.code.trim() || !draft.nameJa.trim() || problem) return;
    startTransition(async () => {
      const result = await createMovementType({
        code: draft.code,
        nameJa: draft.nameJa,
        nameTranslations: draft.nameTranslations,
        direction: draft.direction,
        requiresFrom: draft.requiresFrom,
        requiresTo: draft.requiresTo,
        sortOrder: typeof draft.sortOrder === "number" ? draft.sortOrder : 0,
        isActive: draft.isActive,
        notes: draft.notes,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("inventory.movementTypes.created", {
            name: draft.nameJa,
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
      title={tr("inventory.movementTypes.newMovementType")}
    >
      <MovementTypeFields
        codeEditable
        draft={draft}
        floorProblem={problem}
        onChange={setDraft}
      />
    </FormModal>
  );
}

export function EditMovementTypeModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MovementTypeModalTarget | null;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<MovementTypeDraft>(EMPTY_DRAFT);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  if (opened && target && seededFrom !== target.id) {
    setSeededFrom(target.id);
    setDraft({
      code: target.code,
      nameJa: target.nameJa,
      nameTranslations: target.nameTranslations,
      direction: target.direction,
      requiresFrom: target.requiresFrom,
      requiresTo: target.requiresTo,
      sortOrder: target.sortOrder,
      isActive: target.isActive,
      notes: target.notes ?? "",
    });
  }

  const resetAndClose = () => {
    setSeededFrom(null);
    onClose();
  };

  const problem = floorViolation(draft);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!target || !draft.nameJa.trim() || problem) return;
    startTransition(async () => {
      const result = await updateMovementType(target.id, {
        code: target.code,
        nameJa: draft.nameJa,
        nameTranslations: draft.nameTranslations,
        direction: draft.direction,
        requiresFrom: draft.requiresFrom,
        requiresTo: draft.requiresTo,
        sortOrder: typeof draft.sortOrder === "number" ? draft.sortOrder : 0,
        isActive: draft.isActive,
        notes: draft.notes,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("inventory.movementTypes.updated", {
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
      title={tr("inventory.movementTypes.editTheMovementType")}
    >
      <MovementTypeFields
        codeEditable={false}
        draft={draft}
        floorProblem={problem}
        onChange={setDraft}
      />
    </FormModal>
  );
}

export function ToggleMovementTypeActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: MovementTypeModalTarget | null;
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
            ? tr("inventory.movementTypes.disableConfirm", {
                name: label(target),
              })
            : tr("inventory.movementTypes.enableConfirm", {
                name: label(target),
              })
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMovementTypesActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? tr("common.disabled2") : tr("common.enabled2"),
              message: isActive
                ? tr("inventory.movementTypes.disabled", {
                    name: label(target),
                  })
                : tr("inventory.movementTypes.enabled", {
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
          ? tr("inventory.movementTypes.disableTitle")
          : tr("inventory.movementTypes.enableTitle")
      }
    />
  );
}
