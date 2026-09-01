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
import { useTranslations } from "next-intl";
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
  const tr = useTranslations();
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
          title: tr("common.error2"),
          message: r.error ?? tr("common.theOperationFailed"),
          color: "red",
        });
      }
    });

  if (status === "PENDING") {
    if (!canApprove) {
      return (
        <ActionCard
          description={tr(
            "documents.pagePublishCard.itIsPublishedOnceApproved",
          )}
          icon={<IconClock size={20} />}
          title={tr("documents.pagePublishCard.pendingApprovalToPublish")}
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
                    tr("common.approved"),
                  )
                }
              />
              <RejectButton
                disabled={isPending}
                onClick={() => setRejectOpen(true)}
              />
            </>
          }
          description={tr("common.reviewItAndEitherApproveOr")}
          icon={<IconCheck size={20} />}
          title={tr("common.waitingForYourApproval")}
          tone="approve"
        />
        <ModalShell
          confirmColor="red"
          confirmDisabled={!reason.trim()}
          confirmLabel={tr("common.sendBack")}
          loading={isPending}
          onClose={() => setRejectOpen(false)}
          onConfirm={() =>
            run(
              () =>
                rejectPagePublish(pageNumber, reason).then((r) => ({
                  ok: r.ok,
                  error: r.ok ? undefined : r.error,
                })),
              tr("common.sentBack"),
            )
          }
          opened={rejectOpen}
          title={tr("common.reject")}
        >
          <Text mb="sm" size="sm">
            {tr("documents.pagePublishCard.enterAReasonForSendingIt")}
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
            {approvalRequired
              ? tr("documents.pagePublishCard.requestToPublish")
              : tr("common.publish")}
          </PrimaryButton>
        }
        description={
          approvalRequired
            ? tr("documents.pagePublishCard.thePublishedVersionIsReplacedOnce")
            : tr("documents.pagePublishCard.thePublishedVersionIsReplacedWith")
        }
        icon={
          openComments > 0 ? (
            <IconAlertTriangle size={20} />
          ) : (
            <IconSend size={20} />
          )
        }
        title={tr("documents.pagePublishCard.thereAreUnpublishedChanges")}
        tone="action"
      />
      <ModalShell
        confirmLabel={
          approvalRequired ? tr("common.request2") : tr("common.publish")
        }
        loading={isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          run(
            () =>
              publishPage(pageNumber).then((r) => ({
                ok: r.ok,
                error: r.ok ? undefined : r.error,
              })),
            approvalRequired
              ? tr("documents.pagePublishCard.requestedToPublish")
              : tr("common.published"),
          )
        }
        opened={confirmOpen}
        title={
          approvalRequired
            ? tr("documents.pagePublishCard.requestToPublishTitle")
            : tr("documents.pagePublishCard.confirmPublishing")
        }
      >
        <Text size="sm">
          {openComments > 0
            ? tr("documents.pagePublishCard.thereAreUnresolvedComments", {
                count: openComments,
              })
            : tr("documents.pagePublishCard.theLatestRevisionWillBePublished")}
        </Text>
      </ModalShell>
    </>
  );
}
