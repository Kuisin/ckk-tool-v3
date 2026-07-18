"use client";

/**
 * ProductTypesListPanel — 製品項目（SY04）の「製品種別」一覧。
 *
 * 有効切替・並び替え・削除・追加のみ。各種別（項目の割り当て）の編集は
 * /settings/product-items/types/[id] の編集ページで行う。
 * リスト操作は updateProductTypes で即時保存する（楽観的更新）。
 */

import {
  ActionIcon,
  Badge,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconPencil,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateProductTypes } from "@/app/(dashboard)/settings/actions";
import { CreateButton, GhostButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import type { ProductType } from "@/lib/product-types";

const BASE = "/settings/product-items/types";

function withOrder(list: ProductType[]): ProductType[] {
  return list.map((t, i) => ({ ...t, order: i }));
}

export function ProductTypesListPanel({ initial }: { initial: ProductType[] }) {
  const [types, setTypes] = useState<ProductType[]>(
    [...initial].sort((a, b) => a.order - b.order),
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const persist = (next: ProductType[]) => {
    const prev = types;
    const normalized = withOrder(next);
    setTypes(normalized);
    startTransition(async () => {
      const res = await updateProductTypes(normalized);
      if (!res.ok) {
        setTypes(prev);
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      } else {
        router.refresh();
      }
    });
  };

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= types.length) return;
    const next = types.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          新規製品作成時の選択肢になります。各種別に項目を割り当てて構成します。
        </Text>
        <CreateButton onClick={() => router.push(`${BASE}/new`)}>
          種別を追加
        </CreateButton>
      </Group>

      {types.length === 0 && (
        <Text c="dimmed" size="sm">
          種別がありません。「種別を追加」から作成してください。
        </Text>
      )}

      {types.map((t, i) => (
        <Paper
          key={t.id}
          p="sm"
          radius="sm"
          style={{ opacity: t.enabled ? 1 : 0.55 }}
          withBorder
        >
          <Group gap="sm" wrap="nowrap">
            <Switch
              checked={t.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = types.slice();
                next[i] = { ...t, enabled: e.currentTarget.checked };
                persist(next);
              }}
            />
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="wrap">
                <Text fw={600} size="sm">
                  {t.name.ja || t.id}
                </Text>
                <Badge color="blue" size="xs" variant="light">
                  項目 {t.assignments.length}
                </Badge>
              </Group>
              {t.description && (
                <Text c="dimmed" lineClamp={1} size="xs">
                  {t.description}
                </Text>
              )}
            </Stack>
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                aria-label="上へ"
                disabled={i === 0 || isPending}
                onClick={() => moveRow(i, -1)}
                variant="subtle"
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="下へ"
                disabled={i === types.length - 1 || isPending}
                onClick={() => moveRow(i, 1)}
                variant="subtle"
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="編集"
                color="blue"
                onClick={() =>
                  router.push(`${BASE}/${encodeURIComponent(t.id)}`)
                }
                variant="subtle"
              >
                <IconPencil size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="削除"
                color="red"
                disabled={isPending}
                onClick={() =>
                  openConfirm({
                    title: "製品種別の削除",
                    message: `「${t.name.ja || t.id}」を削除しますか？`,
                    confirmLabel: "削除",
                    onConfirm: () => persist(types.filter((_, k) => k !== i)),
                  })
                }
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          </Group>
        </Paper>
      ))}

      <Group>
        <GhostButton onClick={() => router.push(`${BASE}/new`)}>
          種別を追加
        </GhostButton>
      </Group>
    </Stack>
  );
}
