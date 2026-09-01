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
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
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
          title: tr("エラー"),
          message: res.error ?? tr("失敗しました"),
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
      labels: { confirm: confirmLabel, cancel: tr("戻る") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        if (!value.trim()) {
          notifications.show({
            title: tr("理由を入力してください"),
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
        title: tr("変更を承認"),
        children: (
          <Stack gap="xs">
            <Text size="sm">{row.title}</Text>
            <Text c="dimmed" size="sm">
              {row.detail}
            </Text>
            <Text size="sm">{tr("承認するとこの変更が適用されます。")}</Text>
          </Stack>
        ),
        labels: { confirm: tr("承認して適用"), cancel: tr("戻る") },
        onConfirm: () =>
          startTransition(async () => {
            const res = await approveUserChangeRequest(row.id);
            if (!res.ok) {
              notifications.show({
                title: tr("エラー"),
                message: res.error,
                color: "red",
              });
              return;
            }
            // 承認はできたが当てられなかった、を成功として流さない。
            if (res.data.applied) {
              notifications.show({
                title: tr("承認して適用しました"),
                message: "",
                color: "green",
              });
            } else {
              notifications.show({
                title: tr("承認しましたが適用できませんでした"),
                message: res.data.error ?? tr("前提が変わっています"),
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
          title: tr("承認しました"),
          message: "",
          color: "green",
        });
        setApproving(null);
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
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
            tr("申請を差し戻す"),
            tr("差し戻しの理由"),
            tr("差し戻す"),
            (reason) =>
              run(
                () =>
                  row.kind === "elevation"
                    ? rejectPrivilegedAccess(row.id, reason)
                    : rejectUserChangeRequest(row.id, reason),
                tr("差し戻しました"),
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
              tr("取り下げました"),
            )
          }
        >
          {tr("取り下げ")}
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
            label={tr("申請する")}
          />
        ) : undefined
      }
      breadcrumbs={[tr("システム"), tr("特権アクセス")]}
      title={tr("特権アクセス")}
    >
      <Alert
        color="blue"
        icon={<IconInfoCircle size={16} />}
        mb="md"
        variant="light"
      >
        <Text size="sm">
          {tr(
            tr(
              "端末の秘密・QRカード・個人データの閲覧は、申請して承認を受けた期間だけ\n          使えます。",
            ),
          )}
          <b>{tr("持ち時間は最初に操作した時点から測りはじめ")}</b>
          {tr(
            tr(
              "、\n          承認された終了日時か持ち時間のどちらか早いほうで切れます。",
            ),
          )}
        </Text>
      </Alert>

      <Tabs defaultValue={toApprove.length > 0 ? "approve" : "mine"}>
        <Tabs.List>
          <Tabs.Tab value="mine">{tr("自分の申請")}</Tabs.Tab>
          {canApprove && (
            <Tabs.Tab value="approve">
              承認する{toApprove.length > 0 ? `（${toApprove.length}）` : ""}
            </Tabs.Tab>
          )}
          {canApprove && <Tabs.Tab value="history">{tr("履歴")}</Tabs.Tab>}
        </Tabs.List>

        <Tabs.Panel pt="md" value="mine">
          {mine.length === 0 ? (
            <EmptyState
              icon={<IconShieldCheck size={20} />}
              message={tr("まだ申請はありません")}
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
                message={tr("決裁待ちの申請はありません")}
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
                message={tr("決裁済みの申請はありません")}
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
                              tr("付与を取り消す"),
                              tr("取り消しの理由"),
                              tr("取り消す"),
                              (reason) =>
                                run(
                                  () => revokePrivilegedAccess(row.id, reason),
                                  tr("取り消しました"),
                                ),
                            )
                          }
                        >
                          {tr("取り消し")}
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
        title={tr("申請を承認")}
      >
        {approving && (
          <Stack gap="sm">
            <Text size="sm">{approving.title}</Text>
            <Text c="dimmed" size="xs">
              理由: {approving.reason}
            </Text>
            <Text fw={600} size="sm">
              {tr("許可する操作")}
            </Text>
            <Text c="dimmed" size="xs">
              {tr(
                tr(
                  "外した操作は承認後も使えません。すべて外す場合は差し戻してください。",
                ),
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
              label={tr("コメント（任意）")}
              minRows={2}
              onChange={(e) => setComment(e.currentTarget.value)}
              value={comment}
            />
            <Group justify="flex-end">
              <GhostButton onClick={() => setApproving(null)}>
                キャンセル
              </GhostButton>
              <ApproveButton
                disabled={granted.length === 0}
                loading={isPending}
                onClick={submitApprove}
              >
                {tr("承認する")}
              </ApproveButton>
            </Group>
          </Stack>
        )}
      </Modal>
    </ListShell>
  );
}
