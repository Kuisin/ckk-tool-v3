"use client";

/**
 * BpModals.tsx — BP master 共通のポップアップ（顧客/最終需要家/外注企業/支店）。
 *
 * 有効・無効切替 / 削除 / 担当者追加は bp.business_partners レベルで共通の
 * Server Actions（master/_shared/bp-actions.ts）を叩く。entityLabel で
 * 画面ごとの文言だけ差し替える。
 */

import { Checkbox, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  addContact,
  deleteBps,
  setBpsActive,
} from "@/app/(dashboard)/master/_shared/bp-actions";
import {
  ConfirmModal,
  FormModal,
  type ModalBaseProps,
} from "@/components/ui/modals";

export interface BpModalTarget {
  id: string;
  bpCode: string;
  name: string;
  isActive: boolean;
}

function label(t: BpModalTarget) {
  return t.name !== "—" ? `${t.name}（${t.bpCode}）` : t.bpCode;
}

export function DeleteBpModal({
  opened,
  onClose,
  target,
  entityLabel,
  onDone,
}: ModalBaseProps & {
  target: BpModalTarget | null;
  entityLabel: string;
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
          ? `${entityLabel}「${label(target)}」を削除します。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteBps([target.id]);
          if (result.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: `${entityLabel}「${label(target)}」を削除しました`,
              color: "green",
            });
            onClose();
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
      title={`${entityLabel}の削除`}
      warning={tr("master.bp.itCannotBeDeletedWhilePrice")}
    />
  );
}

export function ToggleBpActiveModal({
  opened,
  onClose,
  target,
  entityLabel,
  onDone,
}: ModalBaseProps & {
  target: BpModalTarget | null;
  entityLabel: string;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  const isActive = target?.isActive ?? true;
  return (
    <ConfirmModal
      confirmColor={isActive ? "red" : "blue"}
      confirmLabel={isActive ? "無効化する" : tr("common.enable2")}
      loading={isPending}
      message={
        target
          ? isActive
            ? `${entityLabel}「${label(target)}」を無効化します。新規のドキュメントで選択できなくなります。`
            : `${entityLabel}「${label(target)}」を有効化します。再びドキュメントで選択できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setBpsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : tr("common.enabled2"),
              message: `${entityLabel}「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
              color: "green",
            });
            onClose();
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
      title={isActive ? `${entityLabel}の無効化` : `${entityLabel}の有効化`}
    />
  );
}

export function AddContactModal({
  opened,
  onClose,
  bpId,
  bpName,
  onDone,
}: ModalBaseProps & {
  bpId: string;
  bpName: string;
  onDone?: () => void;
}) {
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [nameKana, setNameKana] = useState("");
  const [department, setDepartment] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const resetFields = () => {
    setName("");
    setNameKana("");
    setDepartment("");
    setTitle("");
    setEmail("");
    setPhone("");
    setIsPrimary(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await addContact(bpId, {
        name,
        nameKana,
        department,
        title,
        email,
        phone,
        isPrimary,
      });
      if (result.ok) {
        notifications.show({
          title: tr("common.added"),
          message: `担当者「${name}」を追加しました`,
          color: "green",
        });
        resetFields();
        onClose();
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
      onClose={() => {
        resetFields();
        onClose();
      }}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel={tr("common.add")}
      title={`担当者の追加 — ${bpName}`}
    >
      <Stack gap="sm">
        <SimpleGrid cols={2} spacing="sm">
          <TextInput
            label={tr("common.name3")}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="山田 太郎"
            value={name}
            withAsterisk
          />
          <TextInput
            label={tr("common.kana")}
            onChange={(e) => setNameKana(e.currentTarget.value)}
            placeholder="ヤマダ タロウ"
            value={nameKana}
          />
          <TextInput
            label={tr("master.bp.department")}
            onChange={(e) => setDepartment(e.currentTarget.value)}
            placeholder={tr("master.bp.purchasingDepartment")}
            value={department}
          />
          <TextInput
            label={tr("master.bp.jobTitle")}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder={tr("master.bp.sectionManager")}
            value={title}
          />
          <TextInput
            label={tr("common.emailAddress")}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="taro@example.co.jp"
            type="email"
            value={email}
          />
          <TextInput
            label={tr("common.phoneNumber")}
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="03-1234-5678"
            value={phone}
          />
        </SimpleGrid>
        <Checkbox
          checked={isPrimary}
          label={tr("common.makePrimary")}
          onChange={(e) => setIsPrimary(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}
