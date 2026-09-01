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
import { useState, useTransition } from "react";
import {
  restoreUser,
  suspendUser,
} from "@/app/(dashboard)/settings/users/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { DangerButton, PrimaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
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
          title: tr("エラー"),
          message: tr(res.error) ?? tr("失敗しました"),
          color: "red",
        });
      }
    });

  const confirmSuspend = () =>
    modals.openConfirmModal({
      title: requiresApproval ? "停止の承認を依頼" : tr("ユーザーを停止"),
      children: (
        <Text size="sm">
          {user.displayName}（{user.username}）を
          {kind === "permanent" ? "無期限で" : tr("一時的に")}停止
          {requiresApproval
            ? tr("する依頼を出します。承認されるまでこの人はログインできます。")
            : tr("します。停止中はログインできません。")}
        </Text>
      ),
      labels: {
        confirm: requiresApproval ? "依頼する" : tr("停止"),
        cancel: tr("戻る"),
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
          tr("停止しました"),
        ),
    });

  return (
    <Paper mt="md" p="md" radius="md" withBorder>
      <Title mb="xs" order={5}>
        {tr("利用停止")}
      </Title>

      {!user.isActive ? (
        <Stack gap="sm">
          <Alert
            color={state.isAwaitingRestore ? "blue" : "orange"}
            icon={<IconAlertTriangle size={16} />}
            title={state.label ?? tr("停止中")}
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
                    tr(
                      tr(
                        "期限は過ぎています。自動復帰は毎分の処理で行われるため、\n                  反映まで最大 1 分かかります。",
                      ),
                    ),
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
                  description={tr("承認者がこの内容を見て判断します")}
                  disabled={!restoreCheck.ok}
                  label={tr("復帰の理由")}
                  minRows={2}
                  onChange={(e) => setReason(e.currentTarget.value)}
                  placeholder={tr("例: 休職から復帰したため")}
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
                      tr("復帰しました"),
                    )
                  }
                >
                  {requiresApproval ? "復帰の承認を依頼" : tr("いま復帰させる")}
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
                  { label: tr("無期限停止"), value: "permanent" },
                ]}
                disabled={!suspendCheck.ok}
                onChange={(v) => setKind(v as SuspensionKind)}
                value={kind}
              />
              {kind === "temporary" && (
                <DateTimePicker
                  disabled={!suspendCheck.ok}
                  label={tr("解除予定日時")}
                  minDate={now}
                  onChange={setUntil}
                  placeholder={tr("いつ戻すか")}
                  value={until}
                  withAsterisk
                />
              )}
              <Textarea
                autosize
                description={
                  requiresApproval
                    ? tr(
                        tr(
                          tr(
                            "承認者がこの内容を見て判断します。停止の記録にも残ります",
                          ),
                        ),
                      )
                    : undefined
                }
                disabled={!suspendCheck.ok}
                label={requiresApproval ? "停止の理由" : tr("理由（任意）")}
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
                  {requiresApproval ? "停止の承認を依頼" : tr("停止する")}
                </DangerButton>
              </Group>
            </>
          )}
        </Stack>
      )}
    </Paper>
  );
}
