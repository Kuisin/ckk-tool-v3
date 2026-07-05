"use client";

/**
 * MaterialModals.tsx — 素材の削除 / 有効・無効切替 / 複製ポップアップ (MS05).
 *
 * Ported from design-preview (designs/master/materials/_modals) and wired to
 * the Server Actions.
 */

import { Select, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createMaterial,
  deleteMaterials,
  setMaterialsActive,
} from "@/app/(dashboard)/master/materials/actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";
import { MATERIAL_FORM_OPTIONS, UNIT_OPTIONS } from "@/lib/enum-labels";
import type { Option } from "@/lib/mock";

const MATERIAL_CODE_RE = /^[A-Z][0-9]{2}[A-Z][0-9]{4}-[A-C][0-9]{3}-[0-9]{3}$/;

export interface MaterialModalTarget {
  id: string;
  name: string;
  isActive: boolean;
  materialTypeId: string;
  form: string;
  unit: string;
}

function label(t: MaterialModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.id}）` : t.id;
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
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `素材「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteMaterials([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `素材「${label(target)}」を削除しました`,
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
      title="素材の削除"
      warning="この素材を参照する製品・指示書・在庫が存在する場合は削除できません。無効化をご検討ください。"
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
            ? `素材「${label(target)}」を無効化します。新規の発注・指示書で選択できなくなります。`
            : `素材「${label(target)}」を有効化します。再び発注・指示書で選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setMaterialsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `素材「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={isActive ? "素材の無効化" : "素材の有効化"}
    />
  );
}

export function DuplicateMaterialModal({
  opened,
  onClose,
  source,
  typeOptions,
}: ModalBaseProps & {
  source: MaterialModalTarget | null;
  typeOptions: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [nameJa, setNameJa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [unit, setUnit] = useState<string | null>(null);
  const [seededFrom, setSeededFrom] = useState<string | null>(null);

  // Seed the fields from the copy source each time a new source opens.
  if (opened && source && seededFrom !== source.id) {
    setSeededFrom(source.id);
    setCode("");
    setCodeError(null);
    setNameJa(source.name !== "—" ? `${source.name}（コピー）` : "");
    setNameEn("");
    setTypeId(source.materialTypeId);
    setForm(source.form);
    setUnit(source.unit);
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!MATERIAL_CODE_RE.test(code)) {
      setCodeError("形式は [材種]-[A-C][0-9]{3}-[0-9]{3} で入力してください");
      return;
    }
    setCodeError(null);
    if (!typeId || !form || !unit || !nameJa.trim()) return;
    startTransition(async () => {
      const result = await createMaterial({
        code,
        materialTypeId: typeId,
        nameJa,
        nameEn,
        unit,
        form: form as
          | "POLISHED"
          | "STANDARD_LENGTH"
          | "SEMI_FINISHED"
          | "OTHER",
        isActive: true,
        notes: "",
      });
      if (result.ok) {
        notifications.show({
          title: "複製しました",
          message: `素材「${code}」を作成しました`,
          color: "green",
        });
        setSeededFrom(null);
        onClose();
        router.push(`/master/materials/${result.data.id}`);
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
      title="素材の複製"
    >
      <Stack gap="sm">
        <TextInput disabled label="複製元" readOnly value={source?.id ?? ""} />
        <TextInput
          description="形式: [材種]-[A-C][0-9]{3}-[0-9]{3}"
          error={codeError}
          label="素材コード"
          onChange={(e) => setCode(e.currentTarget.value)}
          placeholder="A01A0001-A001-002"
          value={code}
          withAsterisk
        />
        <Select
          data={typeOptions}
          label="材種"
          onChange={setTypeId}
          searchable
          value={typeId}
          withAsterisk
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
        <Select
          data={MATERIAL_FORM_OPTIONS}
          label="形態"
          onChange={setForm}
          value={form}
          withAsterisk
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
