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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
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
              title: tr("common.deleted"),
              message: `承認グループ「${target.name}」を削除しました`,
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
      title={tr("master.approvalSettings.deleteTheApprovalGroup")}
      warning={tr("master.approvalSettings.itCannotBeDeletedWhileApproval")}
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
              title: isActive ? "無効化しました" : tr("common.enabled2"),
              message: `承認グループ「${target.name}」を${isActive ? "無効化" : "有効化"}しました`,
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
          ? "承認グループの無効化"
          : tr("master.approvalSettings.enableTheApprovalGroup")
      }
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
  const tr = useTranslations();
  const isMobile = useIsMobile();
  return (
    <Stack gap="sm" mt="sm">
      <SegmentedControl
        data={[
          { value: "PERMANENT", label: tr("common.permanent") },
          {
            value: "TEMPORARY",
            label: tr("master.approvalSettings.timeLimited"),
          },
        ]}
        fullWidth={isMobile}
        onChange={(v) => onKindChange(v as MemberKind)}
        value={kind}
      />
      {kind === "TEMPORARY" && (
        <>
          <Text c="dimmed" size="xs">
            {tr("master.approvalSettings.theyCanApproveAsAMember")}
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
            label={tr("common.memo")}
            minRows={2}
            onChange={(e) =>
              onPeriodChange({ ...period, note: e.currentTarget.value })
            }
            placeholder={tr(
              "master.approvalSettings.reasonForMakingItTimeLimited",
            )}
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
  const tr = useTranslations();
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
      confirmLabel={tr("common.add")}
      loading={isPending}
      onClose={closeAndReset}
      onConfirm={() => {
        if (!userId) {
          notifications.show({
            title: tr("common.error2"),
            message: tr("master.approvalSettings.selectAUser"),
            color: "red",
          });
          return;
        }
        const payload = periodPayload(kind, period);
        if (payload.error) {
          notifications.show({
            title: tr("common.error2"),
            message: payload.error,
            color: "red",
          });
          return;
        }
        startTransition(async () => {
          const result = await addGroupMember(groupId, userId, payload.value);
          if (result.ok) {
            notifications.show({
              title: tr("common.added"),
              message: `メンバー「${userLabel}」を追加しました`,
              color: "green",
            });
            closeAndReset();
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
      size="md"
      title={tr("master.approvalSettings.addAMember2")}
    >
      <SearchSelect
        label={tr("common.user")}
        onChange={(value, option) => {
          setUserId(value);
          setUserLabel(option?.label ?? "");
        }}
        onSearch={searchUserOptions}
        placeholder={tr("master.approvalSettings.searchByNameOrUsername")}
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
  const tr = useTranslations();
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
      confirmLabel={tr("common.save2")}
      loading={isPending}
      onClose={close}
      onConfirm={() => {
        if (!target) return;
        const payload = periodPayload(kind, period);
        if (payload.error) {
          notifications.show({
            title: tr("common.error2"),
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
              title: tr("common.saved2"),
              message: `「${target.displayName}」の在籍期間を更新しました`,
              color: "green",
            });
            close();
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
      size="md"
      title={tr("master.approvalSettings.changeTheEmploymentPeriod2")}
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
  const tr = useTranslations();
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
    if (!delegatorId)
      return tr("master.approvalSettings.selectTheOriginalApprover");
    if (!delegateId) return tr("master.approvalSettings.selectADelegate");
    if (delegatorId === delegateId) {
      return tr("master.approvalSettings.theOriginalApproverAndTheDelegate");
    }
    if (!validFrom) return tr("master.approvalSettings.selectAStartDate");
    if (!validUntil) return tr("master.approvalSettings.selectAnEndDate");
    if (validFrom > validUntil) {
      return tr("master.approvalSettings.chooseAnEndDateOnOr");
    }
    return null;
  };

  return (
    <ModalShell
      confirmLabel={tr("common.add")}
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
              title: tr("common.added"),
              message: `代理人「${delegateLabel}」の代理設定を追加しました`,
              color: "green",
            });
            closeAndReset();
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
      size="md"
      title={tr("master.approvalSettings.addADelegation2")}
    >
      <Stack gap="sm">
        <Select
          data={memberOptions}
          label={tr("common.originalApprover")}
          onChange={setDelegatorId}
          placeholder={tr("master.approvalSettings.chooseFromTheGroupSActive")}
          searchable
          value={delegatorId}
          withAsterisk
        />
        <SearchSelect
          label={tr("common.delegate")}
          onChange={(value, option) => {
            setDelegateId(value);
            setDelegateLabel(option?.label ?? "");
          }}
          onSearch={searchUserOptions}
          placeholder={tr("master.approvalSettings.searchByNameOrUsername")}
          storageKey="approval-delegate"
          value={delegateId}
          withAsterisk
        />
        <DatePickerInput
          label={tr("master.approvalSettings.periodStartDate")}
          leftSection={<IconCalendar size={14} />}
          onChange={setValidFrom}
          placeholder={tr("common.pickADate")}
          value={validFrom}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <DatePickerInput
          label={tr("master.approvalSettings.periodEndDate")}
          leftSection={<IconCalendar size={14} />}
          onChange={setValidUntil}
          placeholder={tr("common.pickADate")}
          value={validUntil}
          valueFormat="YYYY/MM/DD"
          withAsterisk
        />
        <Textarea
          autosize
          label={tr("common.reason")}
          minRows={2}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr(
            "master.approvalSettings.businessTripLeaveEtcOptional",
          )}
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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
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
              title: tr("common.deleted"),
              message: `代理人「${delegate.delegateName}」の代理設定を削除しました`,
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
      title={tr("master.approvalSettings.deleteTheDelegation2")}
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
  const tr = useTranslations();
  const [isPending, startTransition] = useTransition();
  return (
    <ConfirmModal
      confirmLabel={tr("common.delete2")}
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
              title: tr("common.deleted"),
              message: `メンバー「${member.displayName}」を削除しました`,
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
      title={tr("master.approvalSettings.removeTheMember2")}
    />
  );
}
