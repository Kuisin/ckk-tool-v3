"use client";

/**
 * BootstrapAdminCard — 初期管理者（ローカル `admin`）を畳むための ActionCard。
 *
 * SY01 のユーザー詳細で、対象が初期管理者のときだけ出る。出し分けと押せるかは
 * すべて `bootstrapAdminState`（純関数・テスト済み）の結果に従う — サーバー側の
 * 実行可否と同じ関数なので、画面とサーバーで判断が食い違わない。
 */

import { Alert, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconLock } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { disableBootstrapAdmin } from "@/app/(dashboard)/settings/users/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import { DangerButton } from "@/components/ui/buttons";
import type { BootstrapAdminState } from "@/lib/bootstrap-admin-core";

export function BootstrapAdminCard({
  state,
  canAdminister,
}: {
  state: BootstrapAdminState;
  /** system:ADMIN を持っているか。無ければ状況の表示だけで操作は出さない。 */
  canAdminister: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (state.status === "not-bootstrap") return null;

  const confirmDisable = () =>
    modals.openConfirmModal({
      title: "初期管理者を無効化",
      children: (
        <Text size="sm">
          初期管理者アカウント（admin）を無効化します。以後このアカウントでは
          ログインできません。管理は各自の管理者アカウントで行ってください。
        </Text>
      ),
      labels: { confirm: "無効化", cancel: "戻る" },
      confirmProps: { color: "red" },
      onConfirm: () =>
        startTransition(async () => {
          const res = await disableBootstrapAdmin();
          if (res.ok) {
            notifications.show({
              title: "無効化しました",
              message: "初期管理者アカウントを無効化しました",
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: res.error,
              color: "red",
            });
          }
        }),
    });

  // 既定パスワードのまま有効 = 誰でも入れる。無効化の可否とは別に、必ず出す。
  const passwordWarning = state.isDefaultPasswordStillActive ? (
    <Alert
      color="red"
      icon={<IconAlertTriangle size={16} />}
      mb="md"
      title="既定パスワードのままです"
    >
      このアカウントはまだ既定パスワード（admin）で、誰でもログインできます。
      すぐに変更するか、下の手順で無効化してください。
    </Alert>
  ) : null;

  if (state.status === "retired") {
    return (
      <ActionCard
        description={state.message ?? ""}
        icon={<IconLock size={20} />}
        title="初期管理者は無効化済み"
        tone="wait"
      />
    );
  }

  const tone = state.canDisable ? "action" : "alert";
  const title = state.canDisable
    ? "初期管理者を無効化できます"
    : "先に実ユーザーへ管理者権限を割り当ててください";

  return (
    <>
      {passwordWarning}
      <ActionCard
        actions={
          canAdminister ? (
            <DangerButton
              disabled={!state.canDisable}
              loading={isPending}
              onClick={confirmDisable}
            >
              無効化
            </DangerButton>
          ) : undefined
        }
        description={state.message ?? ""}
        icon={
          state.canDisable ? (
            <IconLock size={20} />
          ) : (
            <IconAlertTriangle size={20} />
          )
        }
        title={title}
        tone={tone}
      />
    </>
  );
}
