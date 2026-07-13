"use client";

/**
 * ApprovalGroupModals.tsx — 承認グループの削除 / 有効・無効切替と、
 * メンバーの追加・削除ポップアップ (MS0A, design.md §13.5)。
 */

import { notifications } from "@mantine/notifications";
import { useState, useTransition } from "react";
import { searchUserOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  addGroupMember,
  deleteApprovalGroups,
  removeGroupMember,
  setApprovalGroupsActive,
} from "@/app/(dashboard)/master/approval-groups/actions";
import {
  ConfirmModal,
  type ModalBaseProps,
  ModalShell,
} from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";

export interface ApprovalGroupModalTarget {
  id: number;
  name: string;
  isActive: boolean;
}

export function DeleteApprovalGroupModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ApprovalGroupModalTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        target
          ? `承認グループ「${target.name}」を削除します。メンバー割当も同時に削除されます。この操作は取り消せません。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await deleteApprovalGroups([target.id]);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `承認グループ「${target.name}」を削除しました`,
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
      title="承認グループの削除"
      warning="このグループを参照する承認依頼・代理設定が存在する場合は削除できません。無効化をご検討ください。"
    />
  );
}

export function ToggleApprovalGroupActiveModal({
  opened,
  onClose,
  target,
  onDone,
}: ModalBaseProps & {
  target: ApprovalGroupModalTarget | null;
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
            ? `承認グループ「${target.name}」を無効化します。新規の承認依頼で使用できなくなります。`
            : `承認グループ「${target.name}」を有効化します。再び承認依頼で使用できるようになります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!target) return;
        startTransition(async () => {
          const result = await setApprovalGroupsActive([target.id], !isActive);
          if (result.ok) {
            notifications.show({
              title: isActive ? "無効化しました" : "有効化しました",
              message: `承認グループ「${target.name}」を${isActive ? "無効化" : "有効化"}しました`,
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
      title={isActive ? "承認グループの無効化" : "承認グループの有効化"}
    />
  );
}

// ── メンバー ─────────────────────────────────────────────────────────────────

export interface ApprovalGroupMemberTarget {
  userId: string;
  displayName: string;
  username: string;
  isActive: boolean;
}

/** メンバー追加 — ユーザーをサーバー検索で選択して追加する。 */
export function AddApprovalGroupMemberModal({
  opened,
  onClose,
  groupId,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [userId, setUserId] = useState<string | null>(null);
  const [userLabel, setUserLabel] = useState("");

  const closeAndReset = () => {
    setUserId(null);
    setUserLabel("");
    onClose();
  };

  return (
    <ModalShell
      confirmLabel="追加"
      loading={isPending}
      onClose={closeAndReset}
      onConfirm={() => {
        if (!userId) {
          notifications.show({
            title: "エラー",
            message: "ユーザーを選択してください",
            color: "red",
          });
          return;
        }
        startTransition(async () => {
          const result = await addGroupMember(groupId, userId);
          if (result.ok) {
            notifications.show({
              title: "追加しました",
              message: `メンバー「${userLabel}」を追加しました`,
              color: "green",
            });
            closeAndReset();
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
      size="md"
      title="メンバーの追加"
    >
      <SearchSelect
        label="ユーザー"
        onChange={(value, option) => {
          setUserId(value);
          setUserLabel(option?.label ?? "");
        }}
        onSearch={searchUserOptions}
        placeholder="氏名・ユーザー名で検索"
        storageKey="approval-group-member"
        value={userId}
        withAsterisk
      />
    </ModalShell>
  );
}

export function RemoveApprovalGroupMemberModal({
  opened,
  onClose,
  groupId,
  member,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  member: ApprovalGroupMemberTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        member
          ? `メンバー「${member.displayName}（${member.username}）」をこのグループから削除します。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!member) return;
        startTransition(async () => {
          const result = await removeGroupMember(groupId, member.userId);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `メンバー「${member.displayName}」を削除しました`,
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
      title="メンバーの削除"
    />
  );
}
