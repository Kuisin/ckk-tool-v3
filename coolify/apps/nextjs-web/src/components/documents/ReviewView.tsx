"use client";

/**
 * ReviewView — 行単位コメントを付けるレビュー画面。
 *
 * **この画面にだけコメントが出る。** 公開版の閲覧画面（/general/documents/[id]）は
 * 本文を描くだけで、コメントを取得すらしない — 「レビューに出し、公開には
 * 出さない」をコンポーネントの境界で担保している。
 *
 * 行ガターには blame（誰がいつその行を変えたか）を出す。
 */

import {
  ActionIcon,
  Badge,
  Box,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconCheck,
  IconMessage,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  addLineComment,
  deleteLineComment,
  setCommentResolved,
} from "@/app/(dashboard)/general/documents/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { GhostButton, PrimaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import type { BlameLine, LineCommentView } from "@/lib/internal-pages";
import { splitLines } from "@/lib/line-anchor";

interface Thread {
  threadId: string;
  line: number | null;
  anchorLine: number;
  anchorText: string;
  status: "OPEN" | "RESOLVED";
  comments: LineCommentView[];
}

function groupThreads(comments: LineCommentView[]): Thread[] {
  const byThread = new Map<string, LineCommentView[]>();
  for (const c of comments) {
    const list = byThread.get(c.threadId) ?? [];
    list.push(c);
    byThread.set(c.threadId, list);
  }
  return [...byThread.values()].map((list) => {
    const root = list[0];
    return {
      threadId: root.threadId,
      line: root.currentLine,
      anchorLine: root.anchorLine,
      anchorText: root.anchorText,
      status: root.status,
      comments: list,
    };
  });
}

function CommentThread({
  thread,
  pageNumber,
  currentUserId,
  onDone,
}: {
  thread: Thread;
  pageNumber: string;
  currentUserId: string | null;
  onDone: () => void;
}) {
  const tr = useTr();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [reply, setReply] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setReply("");
        onDone();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(r.error) ?? tr("処理に失敗しました"),
          color: "red",
        });
      }
    });

  const outdated = thread.line == null;

  return (
    <Paper
      p="sm"
      radius="sm"
      style={{
        borderLeft: `3px solid var(--mantine-color-${
          thread.status === "RESOLVED" ? "green" : outdated ? "gray" : "blue"
        }-filled)`,
      }}
      withBorder
    >
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="wrap">
          <Group gap="xs" wrap="wrap">
            <Badge
              color={thread.status === "RESOLVED" ? "green" : "blue"}
              size="xs"
              variant="light"
            >
              {thread.status === "RESOLVED" ? "解決済" : tr("未解決")}
            </Badge>
            {outdated && (
              <Tooltip
                label={tr(
                  tr(
                    tr(
                      "この行は編集で変更・削除されました。当時の内容だけが残っています",
                    ),
                  ),
                )}
              >
                <Badge color="gray" size="xs" variant="light">
                  {tr("この行は変更されました")}
                </Badge>
              </Tooltip>
            )}
            <Text c="dimmed" size="xs">
              {outdated
                ? tr("旧 {anchorLine} 行目", { anchorLine: thread.anchorLine })
                : tr("{line} 行目", { line: thread.line })}
            </Text>
          </Group>
          <GhostButton
            leftSection={<IconCheck size={14} />}
            loading={isPending}
            onClick={() =>
              run(() =>
                setCommentResolved(
                  pageNumber,
                  thread.threadId,
                  thread.status !== "RESOLVED",
                ).then((r) => ({
                  ok: r.ok,
                  error: r.ok ? undefined : r.error,
                })),
              )
            }
          >
            {thread.status === "RESOLVED" ? "未解決に戻す" : tr("解決にする")}
          </GhostButton>
        </Group>

        <Text
          c="dimmed"
          ff="mono"
          size="xs"
          style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
        >
          {thread.anchorText || tr("（空行）")}
        </Text>

        {thread.comments.map((c) => (
          <Group align="flex-start" gap="xs" key={c.id} wrap="nowrap">
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={600} size="xs">
                  {c.author ?? tr("（不明）")}
                </Text>
                <Text c="dimmed" size="xs">
                  {fmt.dateTime(c.createdAt)}
                </Text>
              </Group>
              <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {c.body}
              </Text>
            </Stack>
            {c.authorId && c.authorId === currentUserId && (
              <ActionIcon
                aria-label={tr("コメントを削除")}
                color="red"
                onClick={() =>
                  run(() =>
                    deleteLineComment(pageNumber, c.id).then((r) => ({
                      ok: r.ok,
                      error: r.ok ? undefined : r.error,
                    })),
                  )
                }
                variant="subtle"
              >
                <IconTrash size={14} />
              </ActionIcon>
            )}
          </Group>
        ))}

        <Group align="flex-end" gap="xs" wrap={isMobile ? "wrap" : "nowrap"}>
          <Textarea
            autosize
            minRows={1}
            onChange={(e) => setReply(e.currentTarget.value)}
            placeholder={tr("返信")}
            style={{ flex: 1, minWidth: isMobile ? "100%" : undefined }}
            value={reply}
          />
          <GhostButton
            disabled={!reply.trim()}
            fullWidth={isMobile}
            loading={isPending}
            onClick={() =>
              run(() =>
                addLineComment(pageNumber, {
                  line: thread.line ?? thread.anchorLine,
                  body: reply,
                  threadId: thread.threadId,
                }).then((r) => ({
                  ok: r.ok,
                  error: r.ok ? undefined : r.error,
                })),
              )
            }
          >
            {tr("返信")}
          </GhostButton>
        </Group>
      </Stack>
    </Paper>
  );
}

export function ReviewView({
  pageNumber,
  body,
  comments,
  blame,
  currentUserId,
}: {
  pageNumber: string;
  body: string;
  comments: LineCommentView[];
  blame: BlameLine[];
  currentUserId: string | null;
}) {
  const tr = useTr();
  const router = useRouter();
  const fmt = useFormat();
  const isMobile = useIsMobile();
  const [showResolved, setShowResolved] = useState(false);
  const [composeLine, setComposeLine] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [isPending, startTransition] = useTransition();

  const lines = useMemo(() => splitLines(body), [body]);
  const threads = useMemo(() => groupThreads(comments), [comments]);
  const blameByLine = useMemo(
    () => new Map(blame.map((b) => [b.line, b])),
    [blame],
  );

  const visibleThreads = threads.filter(
    (t) => showResolved || t.status === "OPEN",
  );
  const threadsByLine = new Map<number, Thread[]>();
  const detached: Thread[] = [];
  for (const t of visibleThreads) {
    if (t.line == null) {
      detached.push(t);
      continue;
    }
    const list = threadsByLine.get(t.line) ?? [];
    list.push(t);
    threadsByLine.set(t.line, list);
  }

  const submit = (line: number) =>
    startTransition(async () => {
      const r = await addLineComment(pageNumber, { line, body: draft });
      if (r.ok) {
        setDraft("");
        setComposeLine(null);
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(r.error) ?? tr("保存に失敗しました"),
          color: "red",
        });
      }
    });

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <IconMessage size={16} />
          <Text size="sm">
            未解決 {threads.filter((t) => t.status === "OPEN").length} 件
          </Text>
        </Group>
        <Switch
          checked={showResolved}
          label={tr("解決済みも表示")}
          onChange={(e) => setShowResolved(e.currentTarget.checked)}
        />
      </Group>

      <Paper p={0} radius="md" withBorder>
        <Stack gap={0}>
          {lines.length === 0 && (
            <Text c="dimmed" p="md" size="sm">
              {tr("本文がありません。")}
            </Text>
          )}
          {lines.map((text, i) => {
            const no = i + 1;
            const b = blameByLine.get(no);
            const lineThreads = threadsByLine.get(no) ?? [];
            return (
              <Box key={`${no}-${text}`}>
                <Group
                  align="flex-start"
                  gap={0}
                  style={{
                    borderTop:
                      i === 0
                        ? undefined
                        : "1px solid var(--mantine-color-default-border)",
                  }}
                  wrap="nowrap"
                >
                  {/* 行番号 + blame */}
                  <Tooltip
                    disabled={!b}
                    label={
                      b
                        ? `r${b.revision} ${b.editedBy ?? "システム"} ${fmt.dateTime(b.editedAt)}`
                        : ""
                    }
                  >
                    <Box
                      px="xs"
                      py={4}
                      style={{
                        // スマホは行番号だけ。編集者名まで出すと本文が 200px を
                        // 切って、どの行に付けるのか分からなくなる（名前は
                        // タップでツールチップに出る）。
                        width: isMobile ? 40 : 130,
                        flexShrink: 0,
                        background: "var(--mantine-color-gray-0)",
                        cursor: b ? "help" : "default",
                      }}
                    >
                      <Group gap={6} wrap="nowrap">
                        <Text c="dimmed" className="tabular-nums" size="xs">
                          {no}
                        </Text>
                        {!isMobile && (
                          <Text c="dimmed" size="xs" truncate>
                            {b?.editedBy ?? ""}
                          </Text>
                        )}
                      </Group>
                    </Box>
                  </Tooltip>

                  {/* 本文（ソースのまま出す — どの行に付けたか一目で分かるように） */}
                  <Text
                    ff="mono"
                    px="xs"
                    py={4}
                    size="xs"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
                    {text || " "}
                  </Text>

                  <ActionIcon
                    aria-label={tr("{no} 行目にコメント", { no: no })}
                    color="blue"
                    mr={4}
                    mt={2}
                    onClick={() =>
                      setComposeLine(composeLine === no ? null : no)
                    }
                    variant="subtle"
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                </Group>

                {composeLine === no && (
                  <Box
                    p="sm"
                    style={{ background: "var(--mantine-color-blue-0)" }}
                  >
                    <Stack gap="xs">
                      <Textarea
                        autosize
                        minRows={2}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        placeholder={tr("{no} 行目へのコメント", { no: no })}
                        value={draft}
                      />
                      <Group grow={isMobile} justify="flex-end">
                        <GhostButton
                          fullWidth={isMobile}
                          onClick={() => setComposeLine(null)}
                        >
                          {tr("やめる")}
                        </GhostButton>
                        <PrimaryButton
                          disabled={!draft.trim()}
                          fullWidth={isMobile}
                          loading={isPending}
                          onClick={() => submit(no)}
                        >
                          {tr("コメントする")}
                        </PrimaryButton>
                      </Group>
                    </Stack>
                  </Box>
                )}

                {lineThreads.length > 0 && (
                  <Stack gap="xs" p="sm">
                    {lineThreads.map((t) => (
                      <CommentThread
                        currentUserId={currentUserId}
                        key={t.threadId}
                        onDone={() => router.refresh()}
                        pageNumber={pageNumber}
                        thread={t}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      </Paper>

      {detached.length > 0 && (
        <Stack gap="xs">
          <Text c="dimmed" size="sm">
            行が変更・削除されたコメント（{detached.length} 件）
          </Text>
          {detached.map((t) => (
            <CommentThread
              currentUserId={currentUserId}
              key={t.threadId}
              onDone={() => router.refresh()}
              pageNumber={pageNumber}
              thread={t}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
