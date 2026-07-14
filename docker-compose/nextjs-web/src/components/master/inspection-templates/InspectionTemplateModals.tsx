"use client";

/**
 * InspectionTemplateModals.tsx — 検査表テンプレートの削除 / 有効・無効切替と、
 * 検査項目のインライン追加・編集・削除ポップアップ (MS08, design.md §13.4)。
 *
 * 検査項目に個別ページは持たず、詳細画面の「検査項目」タブからモーダルで
 * 操作する。監査はテンプレート行に記録される（actions.ts 参照）。
 */

import {
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useState, useTransition } from "react";
import {
  addTemplateItem,
  deleteInspectionTemplates,
  deleteTemplateItem,
  setInspectionTemplatesActive,
  updateTemplateItem,
} from "@/app/(dashboard)/master/inspection-templates/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";

export interface InspectionTemplateModalTarget {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

function label(t: InspectionTemplateModalTarget) {
  return t.name ? `${t.name}（${t.code}）` : t.code;
}

export function DeleteInspectionTemplateModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `検査表テンプレート「${label(target)}」を削除します。検査項目も同時に削除されます。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteInspectionTemplates([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `検査表テンプレート「${label(target)}」を削除しました`,
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
      title="検査表テンプレートの削除"
      warning="このテンプレートを参照する指示書・検査記録が存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}

export function ToggleInspectionTemplateActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: InspectionTemplateModalTarget | null;
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
            ? `検査表テンプレート「${label(target)}」を無効化します。新規の指示書で選択できなくなります。`
            : `検査表テンプレート「${label(target)}」を有効化します。再び指示書で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setInspectionTemplatesActive(
            [target.id],
            !isActive,
          );
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `検査表テンプレート「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={
        isActive ? "検査表テンプレートの無効化" : "検査表テンプレートの有効化"
      }
    />
  );
}

// ── 検査項目 ─────────────────────────────────────────────────────────────────

export interface InspectionTemplateItemRow {
  id: number;
  itemNameJa: string;
  itemNameEn: string;
  unit: string;
  toleranceMin: number | null;
  toleranceMax: number | null;
  isRequired: boolean;
  sortOrder: number;
}

/** 検査項目の追加・編集（item = null で追加モード）。 */
export function InspectionTemplateItemModal({
  opened,
  onClose,
  templateId,
  item,
  defaultSortOrder = 10,
  onDone,
}: ModalBaseProps & {
  templateId: number;
  item: InspectionTemplateItemRow | null;
  /** 追加時の表示順初期値（既存項目の最大 + 10）。 */
  defaultSortOrder?: number;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isEdit = !!item;

  const [itemNameJa, setItemNameJa] = useState("");
  const [itemNameEn, setItemNameEn] = useState("");
  const [unit, setUnit] = useState("");
  const [toleranceMin, setToleranceMin] = useState<number | null>(null);
  const [toleranceMax, setToleranceMax] = useState<number | null>(null);
  const [isRequired, setIsRequired] = useState(true);
  const [sortOrder, setSortOrder] = useState(defaultSortOrder);
  const [nameError, setNameError] = useState<string | null>(null);

  // 開くたびに対象項目（または追加の初期値）でフォームをリセットする
  useEffect(() => {
    if (!opened) return;
    setItemNameJa(item?.itemNameJa ?? "");
    setItemNameEn(item?.itemNameEn ?? "");
    setUnit(item?.unit ?? "");
    setToleranceMin(item?.toleranceMin ?? null);
    setToleranceMax(item?.toleranceMax ?? null);
    setIsRequired(item?.isRequired ?? true);
    setSortOrder(item?.sortOrder ?? defaultSortOrder);
    setNameError(null);
  }, [opened, item, defaultSortOrder]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!itemNameJa.trim()) {
      setNameError("項目名（日本語）を入力してください");
      return;
    }
    startTransition(async () => {
      const input = {
        itemNameJa: itemNameJa.trim(),
        itemNameEn,
        unit,
        toleranceMin,
        toleranceMax,
        isRequired,
        sortOrder,
      };
      const result = isEdit
        ? await updateTemplateItem(item.id, input)
        : await addTemplateItem(templateId, input);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: isEdit
            ? `検査項目「${input.itemNameJa}」を更新しました`
            : `検査項目「${input.itemNameJa}」を追加しました`,
          color: "green",
        });
        onClose();
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
      onClose={onClose}
      onSubmit={handleSubmit}
      opened={opened}
      size="lg"
      submitLabel={isEdit ? "保存" : "追加"}
      title={isEdit ? "検査項目の編集" : "検査項目の追加"}
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            error={nameError}
            label="項目名（日本語）"
            onChange={(e) => {
              setItemNameJa(e.currentTarget.value);
              if (nameError) setNameError(null);
            }}
            placeholder="例: 外径"
            value={itemNameJa}
            withAsterisk
          />
          <TextInput
            label="項目名（English）"
            onChange={(e) => setItemNameEn(e.currentTarget.value)}
            value={itemNameEn}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput
            label="単位"
            onChange={(e) => setUnit(e.currentTarget.value)}
            placeholder="例: mm"
            value={unit}
          />
          <NumberInput
            decimalScale={4}
            label="許容値（下限）"
            onChange={(val) =>
              setToleranceMin(val === "" || val == null ? null : Number(val))
            }
            value={toleranceMin ?? ""}
          />
          <NumberInput
            decimalScale={4}
            label="許容値（上限）"
            onChange={(val) =>
              setToleranceMax(val === "" || val == null ? null : Number(val))
            }
            value={toleranceMax ?? ""}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <NumberInput
            description="小さい順に表示されます"
            label="表示順"
            onChange={(val) =>
              setSortOrder(val === "" || val == null ? 0 : Number(val))
            }
            value={sortOrder}
          />
          <Switch
            checked={isRequired}
            label="必須項目"
            mt="lg"
            onChange={(e) => setIsRequired(e.currentTarget.checked)}
          />
        </SimpleGrid>
      </Stack>
    </FormModal>
  );
}

export function DeleteInspectionTemplateItemModal({
  opened,
  onClose,
  item,
  onDone,
}: ModalBaseProps & {
  item: InspectionTemplateItemRow | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        item
          ? `検査項目「${item.itemNameJa}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!item) return;
        startTransition(async () => {
          const result = await deleteTemplateItem(item.id);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `検査項目「${item.itemNameJa}」を削除しました`,
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
      title="検査項目の削除"
    />
  );
}
