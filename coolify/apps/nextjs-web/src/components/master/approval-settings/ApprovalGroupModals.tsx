"use client";

/**
 * ApprovalGroupModals.tsx — 承認グループの削除 / 有効・無効切替と、
 * メンバー・期間限定代理の追加・削除ポップアップ (MS0B, design.md §13.5)。
 */

import {
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { DatePickerInput, DateTimePicker } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { IconCalendar } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import { searchUserOptions } from "@/app/(dashboard)/_shared/option-search";
import {
  addDelegate,
  addGroupMember,
  deleteApprovalGroups,
  removeDelegate,
  removeGroupMember,
  setApprovalGroupsActive,
  updateGroupMemberValidity,
} from "@/app/(dashboard)/master/approval-settings/actions";
import { HelpLabel } from "@/components/ui/HelpLabel";
import {
  ConfirmModal,
  type ModalBaseProps,
  ModalShell,
} from "@/components/ui/modals";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { useIsMobile } from "@/hooks/useViewport";
import { validateMemberPeriod } from "@/lib/approval-membership";
import { fieldHelp } from "@/lib/field-help";

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
// ── メンバーの在籍期間（常任 / 期間限定） ───────────────────────────────────
//
// 期間限定メンバーは「その期間だけグループの一員」。代理（下の
// AddApprovalDelegateModal）とは別物で、代理は「本来の承認者の代わりに押す」
// — 承認記録に原承認者が残る。取り違えやすいので画面でも書き分ける。

export type MemberKind = "PERMANENT" | "TEMPORARY";

export interface PeriodDraft {
  validFrom: Date | null;
  validUntil: Date | null;
  note: string;
}

export const emptyPeriod: PeriodDraft = {
  validFrom: null,
  validUntil: null,
  note: "",
};

/** 期間変更モーダルの対象。 */
export interface MemberPeriodTarget {
  userId: string;
  displayName: string;
  validFrom: string | null;
  validUntil: string | null;
  note: string | null;
}

/** 入力 → Server Action の引数（検証は lib/approval-membership と同じ関数）。 */
export function periodPayload(
  kind: MemberKind,
  period: PeriodDraft,
): {
  value?: { validFrom: string; validUntil: string; note?: string };
  error?: string;
} {
  if (kind === "PERMANENT") return {};
  const error = validateMemberPeriod({
    validFrom: period.validFrom ? period.validFrom.toISOString() : null,
    validUntil: period.validUntil ? period.validUntil.toISOString() : null,
  });
  if (error) return { error };
  return {
    value: {
      // biome-ignore lint/style/noNonNullAssertion: validateMemberPeriod で確認済み
      validFrom: period.validFrom!.toISOString(),
      // biome-ignore lint/style/noNonNullAssertion: validateMemberPeriod で確認済み
      validUntil: period.validUntil!.toISOString(),
      note: period.note.trim() || undefined,
    },
  };
}

function MemberPeriodFields({
  kind,
  onKindChange,
  period,
  onPeriodChange,
}: {
  kind: MemberKind;
  onKindChange: (v: MemberKind) => void;
  period: PeriodDraft;
  onPeriodChange: (v: PeriodDraft) => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Stack gap="sm" mt="sm">
      <SegmentedControl
        data={[
          { value: "PERMANENT", label: "常任" },
          { value: "TEMPORARY", label: "期間限定" },
        ]}
        fullWidth={isMobile}
        onChange={(v) => onKindChange(v as MemberKind)}
        value={kind}
      />
      {kind === "TEMPORARY" && (
        <>
          <Text c="dimmed" size="xs">
            この期間だけこのグループの一員として承認できます。期間外は承認者に
            出てきません。
          </Text>
          {/* モバイルは縦積み（SimpleGrid 1 列）— 横 2 分割だと日時
              （YYYY/MM/DD HH:mm）が入力欄に収まらない。 */}
          <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
            <DateTimePicker
              label={<HelpLabel {...fieldHelp("approvalGroup", "validFrom")} />}
              onChange={(v) =>
                onPeriodChange({
                  ...period,
                  validFrom: v ? new Date(v) : null,
                })
              }
              value={period.validFrom}
              valueFormat="YYYY/MM/DD HH:mm"
              withAsterisk
            />
            <DateTimePicker
              label={
                <HelpLabel {...fieldHelp("approvalGroup", "validUntil")} />
              }
              onChange={(v) =>
                onPeriodChange({
                  ...period,
                  validUntil: v ? new Date(v) : null,
                })
              }
              value={period.validUntil}
              valueFormat="YYYY/MM/DD HH:mm"
              withAsterisk
            />
          </SimpleGrid>
          <Textarea
            autosize
            label="メモ"
            minRows={2}
            onChange={(e) =>
              onPeriodChange({ ...period, note: e.currentTarget.value })
            }
            placeholder="期間限定にする理由（任意）"
            value={period.note}
          />
        </>
      )}
    </Stack>
  );
}

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
  const [kind, setKind] = useState<MemberKind>("PERMANENT");
  const [period, setPeriod] = useState<PeriodDraft>(emptyPeriod);

  const closeAndReset = () => {
    setUserId(null);
    setUserLabel("");
    setKind("PERMANENT");
    setPeriod(emptyPeriod);
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
        const payload = periodPayload(kind, period);
        if (payload.error) {
          notifications.show({
            title: "エラー",
            message: payload.error,
            color: "red",
          });
          return;
        }
        startTransition(async () => {
          const result = await addGroupMember(groupId, userId, payload.value);
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
      <MemberPeriodFields
        kind={kind}
        onKindChange={setKind}
        onPeriodChange={setPeriod}
        period={period}
      />
    </ModalShell>
  );
}

/** メンバーの在籍期間の変更（常任 ⇄ 期間限定）。 */
export function EditMemberPeriodModal({
  opened,
  onClose,
  groupId,
  target,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  target: MemberPeriodTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<MemberKind>("PERMANENT");
  const [period, setPeriod] = useState<PeriodDraft>(emptyPeriod);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // 対象が変わったら現在値を読み込む（モーダルを開くたびに初期化）
  if (target && loadedFor !== target.userId) {
    setLoadedFor(target.userId);
    setKind(target.validFrom ? "TEMPORARY" : "PERMANENT");
    setPeriod({
      validFrom: target.validFrom ? new Date(target.validFrom) : null,
      validUntil: target.validUntil ? new Date(target.validUntil) : null,
      note: target.note ?? "",
    });
  }

  const close = () => {
    setLoadedFor(null);
    onClose();
  };

  return (
    <ModalShell
      confirmLabel="保存"
      loading={isPending}
      onClose={close}
      onConfirm={() => {
        if (!target) return;
        const payload = periodPayload(kind, period);
        if (payload.error) {
          notifications.show({
            title: "エラー",
            message: payload.error,
            color: "red",
          });
          return;
        }
        startTransition(async () => {
          const result = await updateGroupMemberValidity(
            groupId,
            target.userId,
            payload.value,
          );
          if (result.ok) {
            notifications.show({
              title: "保存しました",
              message: `「${target.displayName}」の在籍期間を更新しました`,
              color: "green",
            });
            close();
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
      title="在籍期間の変更"
    >
      <Text c="dimmed" mb="xs" size="xs">
        {target?.displayName}
      </Text>
      <MemberPeriodFields
        kind={kind}
        onKindChange={setKind}
        onPeriodChange={setPeriod}
        period={period}
      />
    </ModalShell>
  );
}

// ── 期間限定代理 ─────────────────────────────────────────────────────────────

/** 代理設定の追加 — 原承認者（グループの有効メンバー）× 代理人 × 期間。 */
export function AddApprovalDelegateModal({
  opened,
  onClose,
  groupId,
  memberOptions,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  /** 原承認者の選択肢 = グループの有効メンバー（サーバーから渡す）。 */
  memberOptions: { value: string; label: string }[];
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [delegatorId, setDelegatorId] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const [delegateLabel, setDelegateLabel] = useState("");
  const [validFrom, setValidFrom] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const closeAndReset = () => {
    setDelegatorId(null);
    setDelegateId(null);
    setDelegateLabel("");
    setValidFrom(null);
    setValidUntil(null);
    setReason("");
    setError(null);
    onClose();
  };

  const validate = (): string | null => {
    if (!delegatorId) return "原承認者を選択してください";
    if (!delegateId) return "代理人を選択してください";
    if (delegatorId === delegateId) {
      return "原承認者と代理人は別のユーザーを選択してください";
    }
    if (!validFrom) return "開始日を選択してください";
    if (!validUntil) return "終了日を選択してください";
    if (validFrom > validUntil) {
      return "終了日は開始日以降の日付を選択してください";
    }
    return null;
  };

  return (
    <ModalShell
      confirmLabel="追加"
      loading={isPending}
      onClose={closeAndReset}
      onConfirm={() => {
        const message = validate();
        if (message) {
          setError(message);
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await addDelegate(groupId, {
            // validate() 通過済み — 非 null が確定している
            delegatorId: delegatorId ?? "",
            delegateId: delegateId ?? "",
            validFrom: validFrom ?? "",
            validUntil: validUntil ?? "",
            reason,
          });
          if (result.ok) {
            notifications.show({
              title: "追加しました",
              message: `代理人「${delegateLabel}」の代理設定を追加しました`,
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
      title="代理設定の追加"
    >
      <Stack gap="sm">
        <Select
          data={memberOptions}
          label="原承認者"
          onChange={setDelegatorId}
          placeholder="グループの有効メンバーから選択"
          searchable
          value={delegatorId}
          withAsterisk
        />
        <SearchSelect
          label="代理人"
          onChange={(value, option) => {
            setDelegateId(value);
            setDelegateLabel(option?.label ?? "");
          }}
          onSearch={searchUserOptions}
          placeholder="氏名・ユーザー名で検索"
          storageKey="approval-delegate"
          value={delegateId}
          withAsterisk
        />
        <DatePickerInput
          label="期間（開始日）"
          leftSection={<IconCalendar size={14} />}
          onChange={setValidFrom}
          placeholder="日付を選択"
          value={validFrom}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <DatePickerInput
          label="期間（終了日）"
          leftSection={<IconCalendar size={14} />}
          onChange={setValidUntil}
          placeholder="日付を選択"
          value={validUntil}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <Textarea
          autosize
          label="理由"
          minRows={2}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="出張・休暇など（任意）"
          value={reason}
        />
        {error && (
          <Text c="red" size="xs">
            {error}
          </Text>
        )}
      </Stack>
    </ModalShell>
  );
}

export interface ApprovalDelegateTarget {
  id: string;
  delegatorName: string;
  delegateName: string;
}

/** 代理設定の削除確認。 */
export function RemoveApprovalDelegateModal({
  opened,
  onClose,
  groupId,
  delegate,
  onDone,
}: ModalBaseProps & {
  groupId: number;
  delegate: ApprovalDelegateTarget | null;
  onDone?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel="削除する"
      loading={isPending}
      message={
        delegate
          ? `代理設定（原承認者「${delegate.delegatorName}」→ 代理人「${delegate.delegateName}」）を削除します。代理人はこのグループの承認を行えなくなります。`
          : ""
      }
      onClose={onClose}
      onConfirm={() => {
        if (!delegate) return;
        startTransition(async () => {
          const result = await removeDelegate(groupId, delegate.id);
          if (result.ok) {
            notifications.show({
              title: "削除しました",
              message: `代理人「${delegate.delegateName}」の代理設定を削除しました`,
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
      title="代理設定の削除"
    />
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
