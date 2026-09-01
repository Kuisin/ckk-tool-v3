"use client";

/**
 * MemoHistoryModal — メモ / コメントの改訂履歴（証跡）。
 *
 * 誰がいつ何に書き換えたかを、**その時点の本文つき**で新しい順に見せる。
 * audit_logs の要約と違い本文スナップショットが残るので、書き換え・削除の
 * 突き合わせができる（セキュリティ目的）。
 *
 * 読み取りは対象文書の READ 権限（サーバー側 listMemoRevisions で確認）。
 */

import { Badge, Group, Loader, Stack, Text, Timeline } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModalShell } from "@/components/ui/modals";
import { RichTextView } from "@/components/ui/RichTextView";
import { UserAvatar } from "@/components/ui/UserAvatar";
import type { MemoRevisionView } from "@/lib/document-memos";
import { listMemoRevisionsAction } from "./memo-actions";

export function MemoHistoryModal({
  opened,
  onClose,
  ownerType,
  memoId,
}: {
  opened: boolean;
  onClose: () => void;
  ownerType: string;
  memoId: string;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  const [revisions, setRevisions] = useState<MemoRevisionView[] | null>(null);
  const [pending, start] = useTransition();

  /** 操作 → 表示ラベルと色。 */
  const ACTION_LABEL: Record<
    MemoRevisionView["action"],
    { label: string; color: string }
  > = {
    CREATE: { label: tr("common.create2"), color: "green" },
    UPDATE: { label: tr("ui.memoHistoryModal.actionUpdated"), color: "blue" },
    DELETE: { label: tr("common.delete"), color: "red" },
    ARCHIVE: { label: tr("common.archived2"), color: "gray" },
    RESTORE: {
      label: tr("ui.memoHistoryModal.actionRestored"),
      color: "teal",
    },
  };

  useEffect(() => {
    if (!opened) return;
    start(async () =>
      setRevisions(await listMemoRevisionsAction(ownerType, memoId)),
    );
  }, [opened, ownerType, memoId]);

  return (
    <ModalShell
      hideFooter
      onClose={onClose}
      opened={opened}
      title={tr("common.changeHistory")}
    >
      {pending || revisions === null ? (
        <Group justify="center" py="lg">
          <Loader size="sm" />
        </Group>
      ) : revisions.length === 0 ? (
        <EmptyState
          icon={<IconHistory size={24} />}
          message={tr("ui.memoHistoryModal.thereIsNoChangeHistoryYet")}
        />
      ) : (
        <Timeline active={-1} bulletSize={24} lineWidth={1}>
          {revisions.map((rev) => {
            const meta = ACTION_LABEL[rev.action] ?? {
              label: rev.action,
              color: "gray",
            };
            return (
              <Timeline.Item
                bullet={
                  <UserAvatar
                    name={rev.editorName}
                    size={24}
                    thumbSrc={rev.editorAvatarUrl}
                  />
                }
                key={rev.id}
                lineVariant="dotted"
                title={
                  <Group gap="xs" wrap="nowrap">
                    <Badge color={meta.color} size="xs" variant="light">
                      {meta.label}
                    </Badge>
                    <Text fw={600} size="sm">
                      {rev.editorName}
                    </Text>
                    <Text c="dimmed" size="xs">
                      {fmt.dateTime(rev.editedAt)}
                    </Text>
                  </Group>
                }
              >
                <Stack gap={4} mt={4}>
                  <Text c="dimmed" size="xs">
                    {rev.action === "DELETE"
                      ? tr("ui.memoHistoryModal.bodyJustBeforeDeletion")
                      : tr("ui.memoHistoryModal.bodyAfterThisOperation")}
                  </Text>
                  <RichTextView doc={rev.content} />
                </Stack>
              </Timeline.Item>
            );
          })}
        </Timeline>
      )}
    </ModalShell>
  );
}
