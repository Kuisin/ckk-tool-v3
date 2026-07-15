"use client";

/**
 * NotificationListView — 通知一覧（全件）。
 *
 * フィルタ（未読のみ・種別）とページはすべて URL search params に保持 —
 * ブラウザバック・リロード・URL 共有で状態が再現される。
 * 行クリック = 既読化 + linkPath へ遷移。
 */

import {
  Badge,
  Group,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconBellOff } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  markAllReadAction,
  markReadAction,
} from "@/components/layout/notification-actions";
import { GhostButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { type NotificationItem, relativeTime } from "@/hooks/useNotifications";
import {
  NOTIFICATION_TYPE_LABEL,
  NOTIFICATION_TYPE_OPTIONS,
} from "@/lib/enum-labels";

export function NotificationListView({
  items,
  total,
  unreadCount,
  page,
  pageSize,
  unreadOnly,
  type,
}: {
  items: NotificationItem[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  unreadOnly: boolean;
  type: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /** search params を差分更新して遷移（フィルタ変更時は 1 ページ目へ）。 */
  const updateParams = (
    patch: Record<string, string | null>,
    resetPage = true,
  ) => {
    const next = new URLSearchParams(searchParams.toString());
    if (resetPage) next.delete("page");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    router.replace(`/notifications?${next.toString()}`);
  };

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markReadAction(notif.id);
      router.refresh();
    }
    if (notif.linkPath) router.push(notif.linkPath);
  };

  const handleMarkAllRead = async () => {
    await markAllReadAction();
    router.refresh();
  };

  return (
    <Stack gap="md">
      <PageHeader
        actions={
          unreadCount > 0 ? (
            <GhostButton onClick={handleMarkAllRead}>
              すべて既読（{unreadCount}）
            </GhostButton>
          ) : undefined
        }
        breadcrumbs={[{ label: "通知" }]}
        title="通知"
      />

      <Paper p="sm" radius="md" shadow="xs">
        {/* フィルタバー（URL 同期） */}
        <Group align="center" gap="sm" mb="sm">
          <Switch
            checked={unreadOnly}
            label="未読のみ"
            onChange={(e) =>
              updateParams({ unread: e.currentTarget.checked ? "1" : null })
            }
            size="sm"
          />
          <Select
            clearable
            data={NOTIFICATION_TYPE_OPTIONS}
            onChange={(v) => updateParams({ type: v })}
            placeholder="種別"
            value={type}
            w={160}
          />
          <Text c="dimmed" ml="auto" size="xs">
            {total} 件
          </Text>
        </Group>

        {items.length === 0 ? (
          <EmptyState
            icon={<IconBellOff size={24} />}
            message="通知はありません"
          />
        ) : (
          <Stack gap={0}>
            {items.map((notif) => (
              <UnstyledButton
                className="notification-item block w-full text-left"
                data-unread={notif.isRead ? undefined : true}
                key={notif.id}
                onClick={() => handleClick(notif)}
                px="sm"
                py="sm"
              >
                <Group align="flex-start" justify="space-between" wrap="nowrap">
                  <Stack className="min-w-0" gap={2}>
                    <Group gap="xs" wrap="nowrap">
                      <Badge size="xs" variant="light">
                        {NOTIFICATION_TYPE_LABEL[notif.type] ?? notif.type}
                      </Badge>
                      <Text fw={notif.isRead ? 400 : 600} size="sm" truncate>
                        {notif.title}
                      </Text>
                    </Group>
                    {notif.message && (
                      <Text c="dimmed" size="xs">
                        {notif.message}
                      </Text>
                    )}
                  </Stack>
                  <Text c="dimmed" className="whitespace-nowrap" size="xs">
                    {relativeTime(notif.createdAt)}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}

        {totalPages > 1 && (
          <Group justify="center" mt="sm">
            <Pagination
              onChange={(p) =>
                updateParams({ page: p === 1 ? null : String(p) }, false)
              }
              total={totalPages}
              value={page}
            />
          </Group>
        )}
      </Paper>
    </Stack>
  );
}
