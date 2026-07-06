"use client";

/**
 * ProductModals.tsx — 製品の削除 / 有効・無効切替 / 複製ポップアップ (MS03).
 *
 * Ported from design-preview (designs/master/products/_modals) and wired to
 * the Server Actions. 複製は新コードを自動採番して作成する。
 * （設計図差し替えモーダルは design_files 導入時に追加する。）
 */

import { Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createProduct,
  deleteProducts,
  setProductsActive,
} from "@/app/(dashboard)/master/products/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { UNIT_OPTIONS } from "@/lib/enum-labels";
import type { Option } from "@/lib/mock";

export interface ProductModalTarget {
  id: number;
  code: string | null;
  name: string;
  isActive: boolean;
  materialId: string | null;
  unit: string;
}

function label(t: ProductModalTarget) {
  const code = t.code ?? "未採番";
  return t.name !== "—" ? `${t.name}（${code}）` : code;
}

export function DeleteProductModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProductModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `製品「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteProducts([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `製品「${label(target)}」を削除しました`,
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
      title="製品の削除"
      warning="この製品を参照する試算・価格表・見積書が存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}

export function ToggleProductActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ProductModalTarget | null;
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
            ? `製品「${label(target)}」を無効化します。新規の試算・価格表・見積書で選択できなくなります。`
            : `製品「${label(target)}」を有効化します。再び試算・価格表・見積書で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setProductsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `製品「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={isActive ? "製品の無効化" : "製品の有効化"}
    />
  );
}

export function DuplicateProductModal({
  opened,
  onClose,
  source,
  materialOptions,
}: ModalBaseProps & {
  source: ProductModalTarget | null;
  materialOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [seededFrom, setSeededFrom] = useState<number | null>(null);

  // Seed the fields from the copy source each time a new source opens.
  if (opened && source && seededFrom !== source.id) {
    setSeededFrom(source.id);
    setNameJa(source.name !== "—" ? `${source.name}（コピー）` : "");
    setNameEn("");
    setMaterialId(source.materialId);
    setUnit(source.unit);
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nameJa.trim() || !unit) return;
    startTransition(async () => {
      const result = await createProduct({
        nameJa,
        nameEn,
        materialId,
        unit,
        isActive: true,
        notes: "",
        spec: [],
      });
      if (result.ok) {
        notifications.show({
          title: "複製しました",
          message: `製品「${result.data.code}」を作成しました`,
          color: "green",
        });
        setSeededFrom(null);
        onClose();
        router.push(`/master/products/${result.data.id}`);
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
      onClose={() => {
        setSeededFrom(null);
        onClose();
      }}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel="複製して新規作成"
      title="製品の複製"
    >
      <Stack gap="sm">
        <TextInput disabled label="複製元" readOnly value={source?.id ?? ""} />
        <TextInput
          description="製品コードは保存時に自動採番されます（PRD-YYYYMM-NNNN）"
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
        <Select
          clearable
          data={materialOptions}
          label="素材"
          onChange={setMaterialId}
          searchable
          value={materialId}
        />
        <Select
          data={UNIT_OPTIONS}
          label="単位"
          onChange={setUnit}
          value={unit}
          withAsterisk
        />
      </Stack>
    </FormModal>
  );
}
