"use client";

/**
 * SettingsReorderableList — 設定アプリ共通の「有効切替・並び替え・削除」付き一覧。
 *
 * SY03 製品項目 / SY04 製品種別 の一覧パネルが共用する。行本文は編集ページへの
 * リンク（キーボード操作可）。リスト操作（切替・並び替え・削除）は persist で
 * 即時保存し、失敗時は元に戻す（楽観的更新）。
 */

import { ActionIcon, Group, Paper, Stack, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowDown, IconArrowUp, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { CreateButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { openConfirm } from "@/components/ui/modals";
import { useTr } from "@/hooks/useTr";
import type { ActionResult } from "@/lib/server-action";
import classes from "./SettingsReorderableList.module.css";

export type ReorderableRow = {
  /** 行キー（React key）。 */
  id: string;
  /** 編集ページの URL。行本文のリンク先。 */
  editHref: string;
  /** タイトル行（名称 + バッジ）。 */
  title: ReactNode;
  /** サブ行（キー・説明など）。 */
  subtitle?: ReactNode;
  enabled: boolean;
};

export function SettingsReorderableList<T>({
  initial,
  toRow,
  setEnabled,
  persistAction,
  description,
  addLabel,
  newHref,
  emptyIcon,
  emptyMessage,
  deleteConfirm,
}: {
  initial: T[];
  /** アイテム → 表示行。 */
  toRow: (item: T) => ReorderableRow;
  /** 有効フラグを差し替えたアイテムを返す。 */
  setEnabled: (item: T, enabled: boolean) => T;
  /** 並び順を正規化して保存する Server Action。 */
  persistAction: (next: T[]) => Promise<ActionResult>;
  description: string;
  addLabel: string;
  newHref: string;
  emptyIcon: ReactNode;
  emptyMessage: string;
  /** 削除確認モーダルの文言。 */
  deleteConfirm: (item: T) => { title: string; message: string };
}) {
  const tr = useTr();
  const [items, setItems] = useState<T[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const persist = (next: T[]) => {
    const prev = items;
    setItems(next);
    startTransition(async () => {
      const res = await persistAction(next);
      if (!res.ok) {
        setItems(prev);
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
      } else {
        router.refresh();
      }
    });
  };

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  return (
    <Stack gap="sm" maw={960}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="sm">
          {description}
        </Text>
        <CreateButton
          onClick={() => router.push(newHref)}
          style={{ flexShrink: 0 }}
        >
          {addLabel}
        </CreateButton>
      </Group>

      {items.length === 0 && (
        <EmptyState icon={emptyIcon} message={emptyMessage} />
      )}

      {items.map((item, i) => {
        const row = toRow(item);
        const del = deleteConfirm(item);
        return (
          <Paper
            className={classes.row}
            key={row.id}
            p="sm"
            radius="md"
            style={{ opacity: row.enabled ? 1 : 0.55 }}
            withBorder
          >
            <Group gap="sm" wrap="nowrap">
              <Switch
                checked={row.enabled}
                disabled={isPending}
                onChange={(e) =>
                  persist(
                    items.map((it, k) =>
                      k === i ? setEnabled(it, e.currentTarget.checked) : it,
                    ),
                  )
                }
              />
              <Link className={classes.body} href={row.editHref}>
                <Stack gap={2}>
                  {row.title}
                  {row.subtitle}
                </Stack>
              </Link>
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  aria-label={tr("上へ")}
                  disabled={i === 0 || isPending}
                  onClick={() => moveRow(i, -1)}
                  variant="subtle"
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("下へ")}
                  disabled={i === items.length - 1 || isPending}
                  onClick={() => moveRow(i, 1)}
                  variant="subtle"
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label="削除"
                  color="red"
                  disabled={isPending}
                  onClick={() =>
                    openConfirm({
                      title: del.title,
                      message: del.message,
                      confirmLabel: "削除",
                      onConfirm: () => persist(items.filter((_, k) => k !== i)),
                    })
                  }
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        );
      })}
    </Stack>
  );
}
