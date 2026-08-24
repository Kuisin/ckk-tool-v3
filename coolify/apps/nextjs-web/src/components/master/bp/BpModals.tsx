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
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
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
              title: "削除しました",
              message: `${entityLabel}「${label(target)}」を削除しました`,
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
      }}
      opened={opened}
      title={`${entityLabel}の削除`}
      warning="この取引先を参照する試算・価格表・見積書、または支店が存在する場合は削除できません。無効化をご検討ください。"
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
              title: isActive ? "無効化しました" : "有効化しました",
              message: `${entityLabel}「${label(target)}」を${isActive ? "無効化" : "有効化"}しました`,
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
          title: "追加しました",
          message: `担当者「${name}」を追加しました`,
          color: "green",
        });
        resetFields();
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
      onClose={() => {
        resetFields();
        onClose();
      }}
      onSubmit={handleSubmit}
      opened={opened}
      size="md"
      submitLabel="追加"
      title={`担当者の追加 — ${bpName}`}
    >
      <Stack gap="sm">
        <SimpleGrid cols={2} spacing="sm">
          <TextInput
            label="氏名"
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="山田 太郎"
            value={name}
            withAsterisk
          />
          <TextInput
            label="フリガナ"
            onChange={(e) => setNameKana(e.currentTarget.value)}
            placeholder="ヤマダ タロウ"
            value={nameKana}
          />
          <TextInput
            label="部署"
            onChange={(e) => setDepartment(e.currentTarget.value)}
            placeholder="購買部"
            value={department}
          />
          <TextInput
            label="役職"
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder="課長"
            value={title}
          />
          <TextInput
            label="メールアドレス"
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="taro@example.co.jp"
            type="email"
            value={email}
          />
          <TextInput
            label="電話番号"
            onChange={(e) => setPhone(e.currentTarget.value)}
            placeholder="03-1234-5678"
            value={phone}
          />
        </SimpleGrid>
        <Checkbox
          checked={isPrimary}
          label="主担当にする"
          onChange={(e) => setIsPrimary(e.currentTarget.checked)}
        />
      </Stack>
    </FormModal>
  );
}
