"use client";

/**
 * UserSuspensionPanel — ユーザーの利用停止（一時 / 恒久）と復帰。SY01 詳細。
 *
 * 出し分け・押せるかは `user-suspension-core` の純関数に従う（Server Action と
 * 同じ関数）。停止できない理由はボタンを消さずに**文言で**出す — 押せない理由が
 * 判らないほうが困るため。
 */

import {
  Alert,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  restoreUser,
  suspendUser,
} from "@/app/(dashboard)/settings/users/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DangerButton, PrimaryButton } from "@/components/ui/buttons";
import {
  canRestore,
  canSuspend,
  type SuspensionKind,
  suspensionState,
} from "@/lib/user-suspension-core";
import type { AdminUserDetail } from "@/lib/users-admin";

export function UserSuspensionPanel({
  user,
  actorId,
  targetIsAdmin,
  otherActiveAdminCount,
  canAdminister,
  requiresApproval,
}: {
  user: AdminUserDetail;
  actorId: string;
  targetIsAdmin: boolean;
  otherActiveAdminCount: number;
  canAdminister: boolean;
  /** true = 直接は止められず、変更依頼を出して承認を待つ（管理者以外）。 */
  requiresApproval: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const fmt = useFormat();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<SuspensionKind>("temporary");
  const [until, setUntil] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const target = {
    id: user.id,
    username: user.username,
    isActive: user.isActive,
    disabledUntil: user.disabledUntil ? new Date(user.disabledUntil) : null,
  };
  const now = new Date();
  const state = suspensionState(target, now);
  const suspendCheck = canSuspend(target, {
    actorId,
    targetIsAdmin,
    otherActiveAdminCount,
  });
  const restoreCheck = canRestore(target);

  // 依頼だったのに「停止しました」と出すと、止まっていないものが止まったと
  // 伝わる。サーバーが返した requested をそのまま文言に反映する。
  const run = (
    fn: () => Promise<{
      ok: boolean;
      error?: string;
      data?: { requested: boolean };
    }>,
    ok: string,
  ) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        const requested = res.data?.requested === true;
        notifications.show({
          title: requested ? "承認を依頼しました" : ok,
          message: requested ? "承認されるとこの変更が適用されます" : "",
          color: requested ? "blue" : "green",
        });
        setReason("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error ?? tr("common.failed"),
          color: "red",
        });
      }
    });

  const confirmSuspend = () =>
    modals.openConfirmModal({
      title: requiresApproval
        ? "停止の承認を依頼"
        : tr("settings.userSuspensionPanel.suspendTheUser"),
      children: (
        <Text size="sm">
          {user.displayName}（{user.username}）を
          {kind === "permanent"
            ? "無期限で"
            : tr("settings.userSuspensionPanel.temporarily")}
          停止
          {requiresApproval
            ? tr("settings.userSuspensionPanel.submitsTheRequestThisPersonCan")
            : tr("settings.userSuspensionPanel.theyCannotLogInWhileSuspended")}
        </Text>
      ),
      labels: {
        confirm: requiresApproval
          ? "依頼する"
          : tr("settings.userSuspensionPanel.suspend"),
        cancel: tr("common.back2"),
      },
      confirmProps: { color: "red" },
      onConfirm: () =>
        run(
          () =>
            suspendUser({
              userId: user.id,
              kind,
              until: kind === "temporary" ? until : null,
              reason: reason.trim() || undefined,
            }),
          tr("settings.userSuspensionPanel.suspended"),
        ),
    });

  return (
    <Paper mt="md" p="md" radius="md" withBorder>
      <Title mb="xs" order={5}>
        {tr("settings.userSuspensionPanel.suspend2")}
      </Title>

      {!user.isActive ? (
        <Stack gap="sm">
          <Alert
            color={state.isAwaitingRestore ? "blue" : "orange"}
            icon={<IconAlertTriangle size={16} />}
            title={state.label ?? tr("settings.userSuspensionPanel.suspended2")}
          >
            <Stack gap={4}>
              {user.disabledUntil && (
                <Text size="sm">
                  解除予定: {fmt.dateTime(user.disabledUntil)}
                </Text>
              )}
              {user.disabledReason && (
                <Text size="sm">理由: {user.disabledReason}</Text>
              )}
              {state.isAwaitingRestore && (
                <Text c="dimmed" size="xs">
                  {tr(
                    "settings.userSuspensionPanel.theDeadlineHasPassedAutomaticRestoration",
                  )}
                </Text>
              )}
            </Stack>
          </Alert>
          {canAdminister && (
            <>
              {requiresApproval && (
                <Textarea
                  autosize
                  description={tr("common.theApproverDecidesBasedOnWhat")}
                  disabled={!restoreCheck.ok}
                  label={tr("settings.userSuspensionPanel.reasonForRestoring")}
                  minRows={2}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  placeholder={tr(
                    "settings.userSuspensionPanel.eGReturningFromLeave",
                  )}
                  value={reason}
                  withAsterisk
                />
              )}
              <Group justify="flex-end">
                <PrimaryButton
                  disabled={
                    !restoreCheck.ok || (requiresApproval && !reason.trim())
                  }
                  loading={isPending}
                  onClick={() =>
                    run(
                      () => restoreUser(user.id, reason.trim() || undefined),
                      tr("settings.userSuspensionPanel.restored"),
                    )
                  }
                >
                  {requiresApproval
                    ? "復帰の承認を依頼"
                    : tr("settings.userSuspensionPanel.restoreNow")}
                </PrimaryButton>
              </Group>
            </>
          )}
        </Stack>
      ) : (
        <Stack gap="sm">
          {!suspendCheck.ok && (
            <Alert color="gray" icon={<IconAlertTriangle size={16} />}>
              {suspendCheck.message}
            </Alert>
          )}
          {canAdminister && (
            <>
              <SegmentedControl
                data={[
                  { label: "一時停止", value: "temporary" },
                  {
                    label: tr(
                      "settings.userSuspensionPanel.suspendedIndefinitely",
                    ),
                    value: "permanent",
                  },
                ]}
                disabled={!suspendCheck.ok}
                onChange={(v) => setKind(v as SuspensionKind)}
                value={kind}
              />
              {kind === "temporary" && (
                <DateTimePicker
                  disabled={!suspendCheck.ok}
                  label={tr(
                    "settings.userSuspensionPanel.scheduledToBeReleasedAt",
                  )}
                  minDate={now}
                  onChange={setUntil}
                  placeholder={tr("settings.userSuspensionPanel.whenToRestore")}
                  value={until}
                  withAsterisk
                />
              )}
              <Textarea
                autosize
                description={
                  requiresApproval
                    ? tr(
                        "settings.userSuspensionPanel.theApproverDecidesBasedOnThis",
                      )
                    : undefined
                }
                disabled={!suspendCheck.ok}
                label={
                  requiresApproval ? "停止の理由" : tr("common.reasonOptional")
                }
                maxRows={4}
                minRows={2}
                onChange={(e) => setReason(e.currentTarget.value)}
                value={reason}
                withAsterisk={requiresApproval}
              />
              <Group justify="flex-end">
                <DangerButton
                  disabled={
                    !suspendCheck.ok ||
                    (kind === "temporary" && !until) ||
                    (requiresApproval && !reason.trim())
                  }
                  loading={isPending}
                  onClick={confirmSuspend}
                >
                  {requiresApproval
                    ? "停止の承認を依頼"
                    : tr("settings.userSuspensionPanel.suspend3")}
                </DangerButton>
              </Group>
            </>
          )}
        </Stack>
      )}
    </Paper>
  );
}
