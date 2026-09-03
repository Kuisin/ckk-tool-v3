"use client";

/**
 * PrivilegedAccessView — 特権アクセス（SY0G）の本体。
 *
 * タブは「自分の申請 / 承認する / 履歴」。承認するタブは決裁できる人にだけ出す
 * （空のタブを置くと、権限が無いのか申請が無いのか読めない）。
 */

import {
  Alert,
  Group,
  Modal,
  Stack,
  Tabs,
  Text,
  Textarea,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle, IconShieldCheck } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  approvePrivilegedAccess,
  approveUserChangeRequest,
  cancelPrivilegedAccess,
  cancelUserChangeRequest,
  rejectPrivilegedAccess,
  rejectUserChangeRequest,
  revokePrivilegedAccess,
} from "@/app/(dashboard)/settings/privileged-access/actions";
import { PrivilegedRequestCard } from "@/components/settings/privileged/PrivilegedRequestCard";
import {
  ApproveButton,
  GhostButton,
  RejectButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewButton } from "@/components/ui/NewButton";
import { ListShell } from "@/components/ui/shells";
import type { PrivilegedRequestRow } from "@/lib/privileged-requests";

type ActionFn = () => Promise<{ ok: boolean; error?: string }>;

export function PrivilegedAccessView({
  mine,
  toApprove,
  decided,
  canApprove,
  canRequest,
}: {
  mine: PrivilegedRequestRow[];
  toApprove: PrivilegedRequestRow[];
  decided: PrivilegedRequestRow[];
  canApprove: boolean;
  canRequest: boolean;
}) {
  const tr = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // 承認モーダル: 一部だけ許可できるので、対象の行とチェック状態を持つ。
  const [approving, setApproving] = useState<PrivilegedRequestRow | null>(null);
  const [granted, setGranted] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const run = (fn: ActionFn, ok: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        notifications.show({ title: ok, message: "", color: "green" });
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error ?? tr("common.failed"),
          color: "red",
        });
      }
    });

  /** 差し戻し・取り消しは理由が要るので、入力させてから実行する。 */
  const promptReason = (
    title: string,
    label: string,
    confirmLabel: string,
    onConfirm: (reason: string) => void,
  ) => {
    let value = "";
    modals.openConfirmModal({
      title,
      children: (
        <Textarea
          autosize
          data-autofocus
          label={label}
          minRows={3}
          onChange={(e) => {
            value = e.currentTarget.value;
          }}
          withAsterisk
        />
      ),
      labels: { confirm: confirmLabel, cancel: tr("common.back2") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        if (!value.trim()) {
          notifications.show({
            title: tr("common.enterAReason2"),
            message: "",
            color: "red",
          });
          return;
        }
        onConfirm(value.trim());
      },
    });
  };

  const openApprove = (row: PrivilegedRequestRow) => {
    if (row.kind === "user-change") {
      // 方式 B は「その変更を当てるか否か」の二択。部分承認の余地が無い。
      modals.openConfirmModal({
        title: tr("settings.privileged.approveTheChange"),
        children: (
          <Stack gap="xs">
            <Text size="sm">{row.title}</Text>
            <Text c="dimmed" size="sm">
              {row.detail}
            </Text>
            <Text size="sm">
              {tr("settings.privileged.approvingAppliesThisChange")}
            </Text>
          </Stack>
        ),
        labels: {
          confirm: tr("settings.privileged.approveAndApply"),
          cancel: tr("common.back2"),
        },
        onConfirm: () =>
          startTransition(async () => {
            const res = await approveUserChangeRequest(row.id);
            if (!res.ok) {
              notifications.show({
                title: tr("common.error2"),
                message: res.error,
                color: "red",
              });
              return;
            }
            // 承認はできたが当てられなかった、を成功として流さない。
            if (res.data.applied) {
              notifications.show({
                title: tr("settings.privileged.approvedAndApplied"),
                message: "",
                color: "green",
              });
            } else {
              notifications.show({
                title: tr("settings.privileged.approvedButItCouldNotBe"),
                message:
                  res.data.error ??
                  tr("settings.privileged.thePremiseHasChanged"),
                color: "orange",
                autoClose: false,
              });
            }
            router.refresh();
          }),
      });
      return;
    }
    setApproving(row);
    setGranted(row.operations.map((o) => o.key));
    setComment("");
  };

  const submitApprove = () => {
    const row = approving;
    if (!row) return;
    startTransition(async () => {
      const res = await approvePrivilegedAccess({
        id: row.id,
        grantedOperations: granted,
        comment: comment.trim() || undefined,
      });
      if (res.ok) {
        notifications.show({
          title: tr("common.approved"),
          message: "",
          color: "green",
        });
        setApproving(null);
        router.refresh();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  const approveActions = (row: PrivilegedRequestRow) => (
    <>
      <ApproveButton loading={isPending} onClick={() => openApprove(row)} />
      <RejectButton
        loading={isPending}
        onClick={() =>
          promptReason(
            tr("settings.privileged.sendTheRequestBack"),
            tr("settings.privileged.reasonForSendingBack"),
            tr("common.sendBack"),
            (reason) =>
              run(
                () =>
                  row.kind === "elevation"
                    ? rejectPrivilegedAccess(row.id, reason)
                    : rejectUserChangeRequest(row.id, reason),
                tr("common.sentBack"),
              ),
          )
        }
      />
    </>
  );

  const myActions = (row: PrivilegedRequestRow) => {
    if (row.status === "PENDING") {
      return (
        <GhostButton
          loading={isPending}
          onClick={() =>
            run(
              () =>
                row.kind === "elevation"
                  ? cancelPrivilegedAccess(row.id)
                  : cancelUserChangeRequest(row.id),
              tr("settings.privileged.withdrawn"),
            )
          }
        >
          {tr("settings.privileged.withdraw")}
        </GhostButton>
      );
    }
    return null;
  };

  return (
    <ListShell
      action={
        canRequest ? (
          <NewButton
            href="/settings/privileged-access/new"
            label={tr("common.request2")}
          />
        ) : undefined
      }
      breadcrumbs={[tr("common.system"), tr("common.privilegedAccess")]}
      title={tr("common.privilegedAccess")}
    >
      <Alert
        color="blue"
        icon={<IconInfoCircle size={16} />}
        mb="md"
        variant="light"
      >
        <Text size="sm">
          {tr("settings.privileged.viewingDeviceSecretsQrCardsAnd")}
          <b>{tr("settings.privileged.theClockStartsFromTheFirst2")}</b>
          {tr("settings.privileged.andItEndsAtWhicheverComes")}
        </Text>
      </Alert>

      <Tabs defaultValue={toApprove.length > 0 ? "approve" : "mine"}>
        <Tabs.List>
          <Tabs.Tab value="mine">
            {tr("settings.privileged.myRequests")}
          </Tabs.Tab>
          {canApprove && (
            <Tabs.Tab value="approve">
              承認する{toApprove.length > 0 ? `（${toApprove.length}）` : ""}
            </Tabs.Tab>
          )}
          {canApprove && (
            <Tabs.Tab value="history">{tr("common.history")}</Tabs.Tab>
          )}
        </Tabs.List>

        <Tabs.Panel pt="md" value="mine">
          {mine.length === 0 ? (
            <EmptyState
              icon={<IconShieldCheck size={20} />}
              message={tr("settings.privileged.thereAreNoRequestsYet")}
            />
          ) : (
            <Stack gap="sm">
              {mine.map((row) => (
                <PrivilegedRequestCard
                  actions={myActions(row)}
                  key={`${row.kind}-${row.id}`}
                  row={row}
                />
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        {canApprove && (
          <Tabs.Panel pt="md" value="approve">
            {toApprove.length === 0 ? (
              <EmptyState
                icon={<IconShieldCheck size={20} />}
                message={tr("settings.privileged.thereAreNoRequestsAwaitingA")}
              />
            ) : (
              <Stack gap="sm">
                {toApprove.map((row) => (
                  <PrivilegedRequestCard
                    actions={approveActions(row)}
                    key={`${row.kind}-${row.id}`}
                    row={row}
                  />
                ))}
              </Stack>
            )}
          </Tabs.Panel>
        )}

        {canApprove && (
          <Tabs.Panel keepMounted={false} pt="md" value="history">
            {decided.length === 0 ? (
              <EmptyState
                icon={<IconShieldCheck size={20} />}
                message={tr("settings.privileged.thereAreNoDecidedRequests")}
              />
            ) : (
              <Stack gap="sm">
                {decided.map((row) => (
                  <PrivilegedRequestCard
                    actions={
                      row.kind === "elevation" && row.status === "APPROVED" ? (
                        <GhostButton
                          loading={isPending}
                          onClick={() =>
                            promptReason(
                              tr("settings.privileged.revokeTheGrant"),
                              tr("settings.privileged.reasonForRevoking"),
                              tr("common.revoke"),
                              (reason) =>
                                run(
                                  () => revokePrivilegedAccess(row.id, reason),
                                  tr("settings.privileged.revoked"),
                                ),
                            )
                          }
                        >
                          {tr("common.revoked2")}
                        </GhostButton>
                      ) : null
                    }
                    key={`${row.kind}-${row.id}`}
                    row={row}
                  />
                ))}
              </Stack>
            )}
          </Tabs.Panel>
        )}
      </Tabs>

      {/* 部分承認 — 要求された操作のうち許可するものだけを残す。 */}
      <Modal
        onClose={() => setApproving(null)}
        opened={approving !== null}
        title={tr("settings.privileged.approveTheRequest")}
      >
        {approving && (
          <Stack gap="sm">
            <Text size="sm">{approving.title}</Text>
            <Text c="dimmed" size="xs">
              理由: {approving.reason}
            </Text>
            <Text fw={600} size="sm">
              {tr("settings.privileged.operationsToAllow")}
            </Text>
            <Text c="dimmed" size="xs">
              {tr(
                "settings.privileged.untickedOperationsStayUnusableAfterApproval",
              )}
            </Text>
            <Stack gap={4}>
              {approving.operations.map((op) => (
                <label key={op.key} style={{ cursor: "pointer" }}>
                  <Group gap="xs" wrap="nowrap">
                    <input
                      checked={granted.includes(op.key)}
                      onChange={(e) =>
                        setGranted((prev) =>
                          e.currentTarget.checked
                            ? [...new Set([...prev, op.key])]
                            : prev.filter((k) => k !== op.key),
                        )
                      }
                      type="checkbox"
                    />
                    <Text size="sm">{op.label}</Text>
                  </Group>
                </label>
              ))}
            </Stack>
            <Textarea
              autosize
              label={tr("common.commentOptional")}
              minRows={2}
              onChange={(e) => setComment(e.currentTarget.value)}
              value={comment}
            />
            <Group justify="flex-end">
              <GhostButton onClick={() => setApproving(null)}>
                {tr("common.cancel")}
              </GhostButton>
              <ApproveButton
                disabled={granted.length === 0}
                loading={isPending}
                onClick={submitApprove}
              >
                {tr("settings.privileged.approve")}
              </ApproveButton>
            </Group>
          </Stack>
        )}
      </Modal>
    </ListShell>
  );
}
