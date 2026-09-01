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
 *   mode="memo"    … 1 文書 1 件の共有メモ。UPDATE 権限があれば誰でも編集できる
 *   mode="comment" … 投稿スレッド。**新しい順**（チャット履歴と同じ向き）で、
 *                    投稿フォームは先頭。編集 / 削除 / アーカイブは投稿者本人
 *                    （+ADMIN）のみ、かつ操作ごとに権限が分かれる
 *                    （canEdit = UPDATE / canDelete = DELETE）。
 *
 * アーカイブは削除ではなく「畳む」— 既定は 1 行に折りたたみ、クリックで展開して
 * 本文を読める。
 *
 * エディタ（prosemirror 一式で重い）は next/dynamic + ssr:false で遅延ロード
 * する。呼び出し側は Tabs.Panel に `keepMounted={false}` を付けること。
 */

import {
  ActionIcon,
  Box,
  Collapse,
  Divider,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArchive,
  IconArchiveOff,
  IconChevronDown,
  IconChevronRight,
  IconEdit,
  IconHistory,
  IconMessage2,
  IconNote,
  IconTrash,
} from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { PrimaryButton, SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { MemoHistoryModal } from "@/components/ui/MemoHistoryModal";
import { openConfirm } from "@/components/ui/modals";
import { RichTextView } from "@/components/ui/RichTextView";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useTr } from "@/hooks/useTr";
import type { MemoView } from "@/lib/document-memos";
import { emptyDoc, isEmptyDoc, type RichTextDoc } from "@/lib/rich-text-core";
import type { Translate } from "@/lib/ui-text";
import {
  deleteMemoAction,
  saveMemoAction,
  setMemoArchivedAction,
} from "./memo-actions";

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

/** 失敗は赤トースト。成功したら true。 */
function notifyResult(
  tr: Translate,
  result: { ok: true } | { ok: false; error: string },
  successTitle: string,
  successMessage: string,
): boolean {
  if (!result.ok) {
    notifications.show({
      title: tr("エラー"),
      message: tr(result.error),
      color: "red",
    });
    return false;
  }
  notifications.show({
    title: successTitle,
    message: successMessage,
    color: "green",
  });
  return true;
}

// ── 共有メモ（1 文書 1 件） ─────────────────────────────────────────────

function MemoBlock({ ownerType, ownerId, memos }: MemoPanelProps) {
  const tr = useTr();
  const fmt = useFormat();
  const router = useRouter();
  const existing = memos[0];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RichTextDoc>(
    existing?.content ?? emptyDoc(),
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pending, start] = useTransition();

  const save = () => {
    start(async () => {
      const result = await saveMemoAction({
        ownerType,
        ownerId,
        content: draft,
      });
      if (
        !notifyResult(tr, result, tr("保存しました"), tr("メモを更新しました"))
      )
        return;
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
            {tr("保存")}
          </PrimaryButton>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      {/* 操作は上部にアイコンで置く（履歴・編集）。本文より先に見つかる位置。 */}
      <Group gap={2} justify="flex-end" wrap="nowrap">
        {existing && (
          <>
            <Tooltip label={tr("変更履歴")} withArrow>
              <ActionIcon
                aria-label={tr("変更履歴")}
                color="gray"
                onClick={() => setHistoryOpen(true)}
                size="sm"
                variant="subtle"
              >
                <IconHistory size={15} />
              </ActionIcon>
            </Tooltip>
            <MemoHistoryModal
              memoId={existing.id}
              onClose={() => setHistoryOpen(false)}
              opened={historyOpen}
              ownerType={ownerType}
            />
          </>
        )}
        {(existing?.canEdit ?? true) &&
          (existing ? (
            <Tooltip label={tr("編集")} withArrow>
              <ActionIcon
                aria-label={tr("編集")}
                color="gray"
                onClick={() => setEditing(true)}
                size="sm"
                variant="subtle"
              >
                <IconEdit size={15} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <SecondaryButton onClick={() => setEditing(true)}>
              {tr("メモを追加")}
            </SecondaryButton>
          ))}
      </Group>

      {existing ? (
        /* メモ本文は白いカードに載せて、タブ背景と区別する。 */
        <Paper bg="var(--mantine-color-body)" p="md" radius="md" withBorder>
          <Stack gap="sm">
            <RichTextView
              doc={existing.content}
              linkTargets={existing.linkTargets}
            />
            <Text c="dimmed" size="xs">
              最終更新: {fmt.dateTime(existing.updatedAt)}（
              {existing.editorName ?? existing.authorName}）
            </Text>
          </Stack>
        </Paper>
      ) : (
        <EmptyState
          icon={<IconNote size={24} />}
          message={tr("メモはまだありません")}
        />
      )}
    </Stack>
  );
}

// ── コメントスレッド（新しい順） ─────────────────────────────────────────

function CommentThread({ ownerType, ownerId, memos }: MemoPanelProps) {
  const tr = useTr();
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
      if (
        !notifyResult(
          tr,
          result,
          tr("投稿しました"),
          tr("コメントを追加しました"),
        )
      )
        return;
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
      if (
        !notifyResult(
          tr,
          result,
          tr("保存しました"),
          tr("コメントを更新しました"),
        )
      )
        return;
      setEditingId(null);
      router.refresh();
    });
  };

  const toggleArchive = (memo: MemoView) => {
    const archiving = memo.archivedAt === null;
    start(async () => {
      const result = await setMemoArchivedAction(memo.id, archiving);
      if (
        !notifyResult(
          tr,
          result,
          archiving ? "アーカイブしました" : tr("復元しました"),
          archiving
            ? tr("コメントを折りたたみました")
            : tr("コメントを通常表示に戻しました"),
        )
      ) {
        return;
      }
      router.refresh();
    });
  };

  const remove = (id: string) => {
    openConfirm({
      title: tr("コメントの削除"),
      message: tr(
        tr(
          "このコメントを完全に削除します。この操作は取り消せません。残したまま畳むだけならアーカイブを使ってください。",
        ),
      ),
      confirmLabel: "削除",
      onConfirm: () =>
        start(async () => {
          const result = await deleteMemoAction(id);
          if (
            !notifyResult(
              tr,
              result,
              tr("削除しました"),
              tr("コメントを削除しました"),
            )
          ) {
            return;
          }
          router.refresh();
        }),
    });
  };

  return (
    <Stack gap="md">
      {/* 新しい順なので投稿フォームは先頭に置く。 */}
      <Paper p="sm" radius="md" withBorder>
        <Stack gap="sm">
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
              {tr("投稿")}
            </PrimaryButton>
          </Group>
        </Stack>
      </Paper>

      {memos.length === 0 ? (
        <EmptyState
          icon={<IconMessage2 size={24} />}
          message={tr("コメントはまだありません")}
        />
      ) : (
        <Stack gap={0}>
          {memos.map((memo, i) => (
            <Box key={memo.id}>
              {i > 0 && <Divider my="sm" />}
              <CommentRow
                editDraft={editDraft}
                editing={editingId === memo.id}
                memo={memo}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => remove(memo.id)}
                onEditDraftChange={setEditDraft}
                onSaveEdit={() => saveEdit(memo.id)}
                onStartEdit={() => {
                  setEditDraft(memo.content);
                  setEditingId(memo.id);
                }}
                onToggleArchive={() => toggleArchive(memo)}
                ownerType={ownerType}
                pending={pending}
              />
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ── コメント 1 件 ────────────────────────────────────────────────────────

function CommentRow({
  memo,
  ownerType,
  editing,
  editDraft,
  pending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditDraftChange,
  onToggleArchive,
  onDelete,
}: {
  memo: MemoView;
  ownerType: string;
  editing: boolean;
  editDraft: RichTextDoc;
  pending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditDraftChange: (doc: RichTextDoc) => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const tr = useTr();
  const fmt = useFormat();
  const archived = memo.archivedAt !== null;
  // アーカイブ済みは既定で畳む。展開状態は行ごとに保持する。
  const [open, setOpen] = useState(!archived);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Stack gap={4}>
      <Group align="center" gap="sm" justify="space-between" wrap="nowrap">
        <Group align="center" gap="xs" style={{ minWidth: 0 }} wrap="nowrap">
          {archived && (
            <ActionIcon
              aria-label={open ? "折りたたむ" : tr("展開する")}
              color="gray"
              onClick={() => setOpen((v) => !v)}
              size="sm"
              variant="subtle"
            >
              {open ? (
                <IconChevronDown size={14} />
              ) : (
                <IconChevronRight size={14} />
              )}
            </ActionIcon>
          )}
          <UserAvatar
            name={memo.authorName}
            size={24}
            thumbSrc={memo.authorAvatarUrl}
          />
          <Text fw={600} size="sm" truncate>
            {memo.authorName}
          </Text>
          <Text c="dimmed" size="xs" style={{ whiteSpace: "nowrap" }}>
            {fmt.dateTime(memo.createdAt)}
            {memo.updatedAt !== memo.createdAt && tr("（編集済み）")}
          </Text>
          {archived && (
            <Text c="dimmed" size="xs" style={{ whiteSpace: "nowrap" }}>
              · アーカイブ済み
              {memo.archivedByName ? `（${memo.archivedByName}）` : ""}
            </Text>
          )}
        </Group>

        {!editing && (
          <Group gap={2} wrap="nowrap">
            {/* 履歴は「読める人なら誰でも」— 書き換えの証跡なので閲覧を絞らない。 */}
            <Tooltip label={tr("変更履歴")} withArrow>
              <ActionIcon
                aria-label={tr("変更履歴")}
                color="gray"
                onClick={() => setHistoryOpen(true)}
                size="sm"
                variant="subtle"
              >
                <IconHistory size={15} />
              </ActionIcon>
            </Tooltip>
            <MemoHistoryModal
              memoId={memo.id}
              onClose={() => setHistoryOpen(false)}
              opened={historyOpen}
              ownerType={ownerType}
            />
            {memo.canEdit && !archived && (
              <Tooltip label={tr("編集")} withArrow>
                <ActionIcon
                  aria-label={tr("編集")}
                  color="gray"
                  disabled={pending}
                  onClick={onStartEdit}
                  size="sm"
                  variant="subtle"
                >
                  <IconEdit size={15} />
                </ActionIcon>
              </Tooltip>
            )}
            {memo.canArchive && (
              <Tooltip label={archived ? "復元" : tr("アーカイブ")} withArrow>
                <ActionIcon
                  aria-label={archived ? "復元" : tr("アーカイブ")}
                  color="gray"
                  disabled={pending}
                  onClick={onToggleArchive}
                  size="sm"
                  variant="subtle"
                >
                  {archived ? (
                    <IconArchiveOff size={15} />
                  ) : (
                    <IconArchive size={15} />
                  )}
                </ActionIcon>
              </Tooltip>
            )}
            {memo.canDelete && (
              <Tooltip label="削除" withArrow>
                <ActionIcon
                  aria-label="削除"
                  color="red"
                  disabled={pending}
                  onClick={onDelete}
                  size="sm"
                  variant="subtle"
                >
                  <IconTrash size={15} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        )}
      </Group>

      {editing ? (
        <Stack gap="sm" mt="xs">
          <RichTextEditorField onChange={onEditDraftChange} value={editDraft} />
          <Group justify="flex-end">
            <SecondaryButton disabled={pending} onClick={onCancelEdit}>
              キャンセル
            </SecondaryButton>
            <PrimaryButton
              disabled={isEmptyDoc(editDraft)}
              loading={pending}
              onClick={onSaveEdit}
            >
              {tr("保存")}
            </PrimaryButton>
          </Group>
        </Stack>
      ) : (
        <Collapse expanded={open}>
          <Box pl={32}>
            <RichTextView doc={memo.content} linkTargets={memo.linkTargets} />
          </Box>
        </Collapse>
      )}
    </Stack>
  );
}
