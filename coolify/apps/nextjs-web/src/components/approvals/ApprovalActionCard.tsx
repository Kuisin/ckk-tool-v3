"use client";

/**
 * ApprovalActionCard — 承認の「いまやること」カード（画面最上部）。
 *
 * 4 つの書類（注文請書 / 指示書 / 素材発注書 / 購買依頼）で共用する。段数は
 * 承認設定 (MS0B) が決めるので、このカードは「何段目 / 全何段 / どのグループ」を
 * サーバーから受け取った ApprovalActionState のまま描くだけで、段の数を知らない。
 *
 * 色は _specs/design.md §10.9 のとおり「ログイン中のユーザーがその操作を
 * できるか」で決まる — 権限あり = 緑、待つだけ = グレー、差し戻し = 赤。
 *
 * ⚠️ 関数 props を取るので **必ず "use client" の親から** 描画すること。
 * Server Component から直接渡すと実行時に落ちる。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowBackUp,
  IconClock,
  IconSend,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { ActionCard } from "@/components/ui/ActionCard";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { ModalShell } from "@/components/ui/modals";
import { fieldHelp } from "@/lib/field-help";
import type { ActionResult } from "@/lib/server-action";

/** lib/approvals fetchApprovalState の結果（直列化可能な素の値だけ）。 */
export interface ApprovalActionState {
  phase: "NONE" | "PENDING" | "APPROVED" | "REJECTED";
  stepNo: number;
  stepCount: number;
  stepLabel: string;
  groupLabel: string;
  mode: "ANY" | "ALL";
  canAct: boolean;
  alreadyActed: boolean;
  remaining: { userId: string; name: string }[];
  steps: {
    stepNo: number;
    label: string;
    groupLabel: string;
    mode: "ANY" | "ALL";
  }[];
}

const MAX_NAMES = 3;

function remainingText(
  remaining: { name: string }[],
  tr: ReturnType<typeof useTranslations>,
): string {
  const names = remaining.slice(0, MAX_NAMES).map((r) => r.name);
  const rest = remaining.length - names.length;
  return rest > 0
    ? tr("approvals.approvalActionCard.remainingNamesWithOthers", {
        names: names.join("、"),
        rest,
      })
    : names.join("、");
}

export function ApprovalActionCard({
  approval,
  subject,
  rejectReason,
  /** 依頼を出せる状態か（書類側の判断 — 例: 下書きのみ）。 */
  canRequest,
  /** 依頼ボタンを押せない理由（あれば disabled + 説明に出す）。 */
  requestBlockedReason,
  onRequest,
  onApprove,
  onReject,
}: {
  approval: ApprovalActionState;
  /** 通知に出す対象名（例: 「指示書 #1042」）。 */
  subject: string;
  rejectReason: string | null;
  canRequest: boolean;
  requestBlockedReason?: string | null;
  /** 依頼の実行。canRequest を自前で描く画面（注文請書）では省略できる。 */
  onRequest?: () => Promise<ActionResult<unknown>>;
  onApprove: () => Promise<ActionResult<unknown>>;
  onReject: (reason: string) => Promise<ActionResult<unknown>>;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (action: () => Promise<ActionResult<unknown>>, done: string) => {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        notifications.show({ title: done, message: subject, color: "green" });
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  const { phase, stepNo, stepCount, stepLabel, groupLabel, mode } = approval;
  const isRejected = phase === "REJECTED";
  // 「第2/3段「部門承認」・製造部長」— 何段あって今どこかを 1 行で出す
  const where =
    stepCount > 1
      ? tr("approvals.approvalActionCard.stepAndGroupLabel", {
          stepNo,
          stepCount,
          stepLabel,
          groupLabel,
        })
      : tr("approvals.approvalActionCard.stepAndGroupLabelSingle", {
          stepLabel,
          groupLabel,
        });

  let card: ReactNode = null;

  if (canRequest && onRequest) {
    const blocked = Boolean(requestBlockedReason);
    card = (
      <ActionCard
        actions={
          <PrimaryButton
            disabled={blocked}
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() => run(onRequest, tr("common.approvalRequested"))}
          >
            {isRejected
              ? tr("approvals.approvalActionCard.reRequestApproval")
              : tr("common.approvalRequest")}
          </PrimaryButton>
        }
        description={
          blocked
            ? requestBlockedReason
            : isRejected
              ? tr("approvals.approvalActionCard.rejectReasonCanReRequest", {
                  reason: rejectReason ?? "—",
                })
              : tr("approvals.approvalActionCard.itIsSentToTheFirst")
        }
        icon={
          isRejected ? <IconArrowBackUp size={20} /> : <IconSend size={20} />
        }
        title={
          isRejected
            ? tr("approvals.approvalActionCard.itWasSentBack")
            : tr("approvals.approvalActionCard.anApprovalRequestIsRequired")
        }
        tone={isRejected ? "alert" : "action"}
      />
    );
  } else if (phase === "PENDING") {
    if (approval.canAct) {
      card = (
        <ActionCard
          actions={
            <>
              <ApproveButton
                loading={isPending}
                onClick={() => run(onApprove, tr("common.approved"))}
              >
                {tr("common.approve")}
              </ApproveButton>
              <RejectButton onClick={() => setRejectOpen(true)} />
            </>
          }
          description={
            mode === "ALL"
              ? tr(
                  "approvals.approvalActionCard.allMembersMustApproveRemaining",
                  {
                    where,
                    count: approval.remaining.length,
                    names: remainingText(approval.remaining, tr),
                  },
                )
              : tr("approvals.approvalActionCard.youCanApproveAsAnApprover", {
                  where,
                })
          }
          icon={<IconShieldCheck size={20} />}
          title={tr("approvals.approvalActionCard.pleaseApprove")}
          tone="approve"
        />
      );
    } else if (approval.alreadyActed) {
      card = (
        <ActionCard
          description={tr("approvals.approvalActionCard.remainingApprovers", {
            where,
            count: approval.remaining.length,
            names: remainingText(approval.remaining, tr),
          })}
          icon={<IconClock size={20} />}
          title={tr("approvals.approvalActionCard.yourApprovalHasBeenRecorded")}
          tone="wait"
        />
      );
    } else {
      card = (
        <ActionCard
          description={tr(
            "approvals.approvalActionCard.onlyGroupMembersCanAct",
            {
              groupLabel,
            },
          )}
          icon={<IconClock size={20} />}
          title={tr("approvals.approvalActionCard.stepLabelWaiting", {
            stepLabel,
          })}
          tone="wait"
        />
      );
    }
  }

  if (!card) return null;

  return (
    <>
      {card}
      <ModalShell
        confirmColor="red"
        confirmLabel={tr("common.sendBack")}
        loading={isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!reason.trim()) {
            notifications.show({
              title: tr("common.error2"),
              message: tr("common.enterAReasonForSendingIt"),
              color: "red",
            });
            return;
          }
          run(() => onReject(reason), tr("common.sentBack"));
        }}
        opened={rejectOpen}
        size="sm"
        title={tr("common.confirmSendingBack")}
      >
        <Text c="dimmed" mb="xs" size="xs">
          {tr("approvals.approvalActionCard.sendingItBackStopsTheApproval")}
        </Text>
        <Textarea
          autosize
          label={<HelpLabel {...fieldHelp("approval", "rejectReason")} />}
          minRows={3}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder={tr("common.enterAReason")}
          value={reason}
          withAsterisk
        />
      </ModalShell>
    </>
  );
}
