"use client";

/**
 * PagePublishCard — 社内文書の「いま何をすべきか」カード。
 *
 * 未解決コメントがあっても**公開は止めない**（ご指定どおり警告のみ）。
 * 押した時点で件数を確認モーダルに出す。
 */

import { Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconSend,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approvePagePublish,
  publishPage,
  rejectPagePublish,
} from "@/app/(dashboard)/general/documents/actions";
import { ActionCard } from "@/components/ui/ActionCard";
import {
  ApproveButton,
  PrimaryButton,
  RejectButton,
} from "@/components/ui/buttons";
import { ModalShell } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";

export function PagePublishCard({
  pageNumber,
  status,
  approvalRequired,
  canEdit,
  canApprove,
  openComments,
  hasUnpublishedChanges,
}: {
  pageNumber: string;
  status: string;
  approvalRequired: boolean;
  canEdit: boolean;
  canApprove: boolean;
  openComments: number;
  hasUnpublishedChanges: boolean;
}) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        notifications.show({ message: done, color: "green" });
        setConfirmOpen(false);
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: r.error ?? tr("処理に失敗しました"),
          color: "red",
        });
      }
    });

  if (status === "PENDING") {
    if (!canApprove) {
      return (
        <ActionCard
          description={tr("承認されると公開されます。")}
          icon={<IconClock size={20} />}
          title={tr("公開の承認依頼中")}
          tone="wait"
        />
      );
    }
    return (
      <>
        <ActionCard
          actions={
            <>
              <ApproveButton
                loading={isPending}
                onClick={() =>
                  run(
                    () =>
                      approvePagePublish(pageNumber).then((r) => ({
                        ok: r.ok,
                        error: r.ok ? undefined : r.error,
                      })),
                    tr("承認しました"),
                  )
                }
              />
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
            </>
          }
          description={tr("内容を確認して承認または差し戻してください。")}
          icon={<IconCheck size={20} />}
          title={tr("あなたの承認依頼中です")}
          tone="approve"
        />
        <ModalShell
          confirmColor="red"
          confirmDisabled={!reason.trim()}
          confirmLabel={tr("差し戻す")}
          loading={isPending}
          onClose={() => setRejectOpen(false)}
          onConfirm={() =>
            run(
              () =>
                rejectPagePublish(pageNumber, reason).then((r) => ({
                  ok: r.ok,
                  error: r.ok ? undefined : r.error,
                })),
              tr("差し戻しました"),
            )
          }
          opened={rejectOpen}
          title="差し戻し"
        >
          <Text mb="sm" size="sm">
            {tr("差し戻す理由を入力してください。")}
          </Text>
          <Textarea
            autosize
            minRows={3}
            onChange={(e) => setReason(e.currentTarget.value)}
            value={reason}
            withAsterisk
          />
        </ModalShell>
      </>
    );
  }

  if (!canEdit || !hasUnpublishedChanges) return null;

  return (
    <>
      <ActionCard
        actions={
          <PrimaryButton
            leftSection={<IconSend size={14} />}
            loading={isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {approvalRequired ? "公開を申請" : tr("公開する")}
          </PrimaryButton>
        }
        description={
          approvalRequired
            ? tr("承認されると公開版が入れ替わります。")
            : tr("公開版が最新のリビジョンに入れ替わります。")
        }
        icon={
          openComments > 0 ? (
            <IconAlertTriangle size={20} />
          ) : (
            <IconSend size={20} />
          )
        }
        title={tr("公開されていない変更があります")}
        tone="action"
      />
      <ModalShell
        confirmLabel={approvalRequired ? "申請する" : tr("公開する")}
        loading={isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () =>
              publishPage(pageNumber).then((r) => ({
                ok: r.ok,
                error: r.ok ? undefined : r.error,
              })),
            approvalRequired ? "公開を申請しました" : tr("公開しました"),
          )
        }
        opened={confirmOpen}
        title={approvalRequired ? "公開の申請" : tr("公開の確認")}
      >
        <Text size="sm">
          {openComments > 0
            ? `未解決のコメントが ${openComments} 件あります。このまま進めますか？`
            : tr("最新のリビジョンを公開します。")}
        </Text>
      </ModalShell>
    </>
  );
}
