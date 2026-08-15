"use client";

/**
 * MemoPanel — 文書メモ / コメント（app.document_memos）の共通パネル。
 *
 * 詳細画面のタブに 1 行差し込むだけで使える自己完結型。データは server 側の
 * `lib/document-memos.listMemos` が用意し、書き込みは memo-actions の
 * Server Action を呼んで `router.refresh()` で再取得する
 * （AttachmentsPanel と同じ流儀）。
 *
 * 2 形態:
 *   mode="memo"    … 1 文書 1 件の共有メモ。誰でも編集できる
 *   mode="comment" … 投稿スレッド。編集・削除は投稿者本人（+ADMIN）のみ
 *
 * エディタ（prosemirror 一式で重い）は next/dynamic + ssr:false で遅延ロード
 * する。詳細画面を開いただけでは読み込まれず、編集・投稿を始めて初めて要る。
 */

import {
  Box,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconMessage2, IconNote, IconTrash } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { openConfirm } from "@/components/ui/modals";
import { RichTextView } from "@/components/ui/RichTextView";
import type { MemoView } from "@/lib/document-memos";
import { formatDateTime } from "@/lib/format";
import { emptyDoc, isEmptyDoc, type RichTextDoc } from "@/lib/rich-text-core";
import { deleteMemoAction, saveMemoAction } from "./memo-actions";

const RichTextEditorField = dynamic(
  () => import("./RichTextEditorField").then((m) => m.RichTextEditorField),
  { ssr: false, loading: () => <Skeleton height={200} radius="sm" /> },
);

export interface MemoPanelProps {
  ownerType: string;
  ownerId: string;
  mode: "memo" | "comment";
  memos: MemoView[];
}

export function MemoPanel(props: MemoPanelProps) {
  return props.mode === "memo" ? (
    <MemoBlock {...props} />
  ) : (
    <CommentThread {...props} />
  );
}

// ── 共有メモ（1 文書 1 件） ─────────────────────────────────────────────

function MemoBlock({ ownerType, ownerId, memos }: MemoPanelProps) {
  const router = useRouter();
  const existing = memos[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RichTextDoc>(
    existing?.content ?? emptyDoc(),
  );
  const [pending, start] = useTransition();

  const save = () => {
    start(async () => {
      const result = await saveMemoAction({
        ownerType,
        ownerId,
        content: draft,
      });
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: "保存しました",
        message: "メモを更新しました",
        color: "green",
      });
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <Stack gap="sm">
        <RichTextEditorField onChange={setDraft} value={draft} />
        <Group justify="flex-end">
          <SecondaryButton
            disabled={pending}
            onClick={() => {
              setDraft(existing?.content ?? emptyDoc());
              setEditing(false);
            }}
          >
            キャンセル
          </SecondaryButton>
          <PrimaryButton
            disabled={isEmptyDoc(draft)}
            loading={pending}
            onClick={save}
          >
            保存
          </PrimaryButton>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {existing ? (
        <>
          <RichTextView doc={existing.content} />
          <Group gap="xs">
            <Text c="dimmed" size="xs">
              最終更新: {formatDateTime(existing.updatedAt)}（
              {existing.editorName ?? existing.authorName}）
            </Text>
          </Group>
        </>
      ) : (
        <EmptyState
          icon={<IconNote size={24} />}
          message="メモはまだありません"
        />
      )}
      <Group justify="flex-end">
        <SecondaryButton onClick={() => setEditing(true)}>
          {existing ? "編集" : "メモを追加"}
        </SecondaryButton>
      </Group>
    </Stack>
  );
}

// ── コメントスレッド（複数件） ───────────────────────────────────────────

function CommentThread({ ownerType, ownerId, memos }: MemoPanelProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<RichTextDoc>(emptyDoc());
  // 投稿フォームを再マウントして中身を空に戻すためのキー。
  const [composerKey, setComposerKey] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<RichTextDoc>(emptyDoc());
  const [pending, start] = useTransition();

  const post = () => {
    start(async () => {
      const result = await saveMemoAction({
        ownerType,
        ownerId,
        content: draft,
      });
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: "投稿しました",
        message: "コメントを追加しました",
        color: "green",
      });
      setDraft(emptyDoc());
      setComposerKey((k) => k + 1);
      router.refresh();
    });
  };

  const saveEdit = (id: string) => {
    start(async () => {
      const result = await saveMemoAction({
        ownerType,
        ownerId,
        id,
        content: editDraft,
      });
      if (!result.ok) {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
        return;
      }
      notifications.show({
        title: "保存しました",
        message: "コメントを更新しました",
        color: "green",
      });
      setEditingId(null);
      router.refresh();
    });
  };

  const remove = (id: string) => {
    openConfirm({
      title: "コメントの削除",
      message: "このコメントを削除します。この操作は取り消せません。",
      confirmLabel: "削除",
      onConfirm: () =>
        start(async () => {
          const result = await deleteMemoAction(id);
          if (!result.ok) {
            notifications.show({
              title: "エラー",
              message: result.error,
              color: "red",
            });
            return;
          }
          notifications.show({
            title: "削除しました",
            message: "コメントを削除しました",
            color: "green",
          });
          router.refresh();
        }),
    });
  };

  return (
    <Stack gap="md">
      {memos.length === 0 ? (
        <EmptyState
          icon={<IconMessage2 size={24} />}
          message="コメントはまだありません"
        />
      ) : (
        <Stack gap={0}>
          {memos.map((memo, i) => (
            <Box key={memo.id}>
              {i > 0 && <Divider my="sm" />}
              <Group
                align="flex-start"
                gap="sm"
                justify="space-between"
                wrap="nowrap"
              >
                <Text fw={600} size="sm">
                  {memo.authorName}
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Text c="dimmed" size="xs">
                    {formatDateTime(memo.createdAt)}
                    {memo.updatedAt !== memo.createdAt && "（編集済み）"}
                  </Text>
                </Group>
              </Group>

              {editingId === memo.id ? (
                <Stack gap="sm" mt="xs">
                  <RichTextEditorField
                    onChange={setEditDraft}
                    value={editDraft}
                  />
                  <Group justify="flex-end">
                    <SecondaryButton
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                    >
                      キャンセル
                    </SecondaryButton>
                    <PrimaryButton
                      disabled={isEmptyDoc(editDraft)}
                      loading={pending}
                      onClick={() => saveEdit(memo.id)}
                    >
                      保存
                    </PrimaryButton>
                  </Group>
                </Stack>
              ) : (
                <>
                  <Box mt={4}>
                    <RichTextView doc={memo.content} />
                  </Box>
                  {memo.canEdit && (
                    <Group gap="xs" mt={4}>
                      <GhostButton
                        onClick={() => {
                          setEditDraft(memo.content);
                          setEditingId(memo.id);
                        }}
                      >
                        編集
                      </GhostButton>
                      <GhostButton
                        color="red"
                        leftSection={<IconTrash size={14} />}
                        onClick={() => remove(memo.id)}
                      >
                        削除
                      </GhostButton>
                    </Group>
                  )}
                </>
              )}
            </Box>
          ))}
        </Stack>
      )}

      <Paper p="sm" radius="md" withBorder>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            コメントを追加
          </Text>
          <RichTextEditorField
            key={composerKey}
            onChange={setDraft}
            value={draft}
          />
          <Group justify="flex-end">
            <PrimaryButton
              disabled={isEmptyDoc(draft)}
              loading={pending}
              onClick={post}
            >
              投稿
            </PrimaryButton>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
