"use client";

/**
 * ItemDefsListPanel — 製品項目（SY04）の「項目定義」一覧。
 *
 * 有効切替・並び替え・削除・追加のみ。各項目の編集は
 * /settings/product-items/[key] の編集ページで行う。
 * リスト操作は updateProductItemDefs で即時保存する（楽観的更新）。
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
import { updateProductItemDefs } from "@/app/(dashboard)/settings/actions";
import { CreateButton, GhostButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { PRODUCT_FIELD_TYPES, type ProductItemDef } from "@/lib/product-types";

const BASE = "/settings/product-items";

const typeLabel = (v: string) =>
  PRODUCT_FIELD_TYPES.find((o) => o.value === v)?.label ?? v;

function withOrder(list: ProductItemDef[]): ProductItemDef[] {
  return list.map((d, i) => ({ ...d, order: i }));
}

export function ItemDefsListPanel({ initial }: { initial: ProductItemDef[] }) {
  const [defs, setDefs] = useState<ProductItemDef[]>(
    [...initial].sort((a, b) => a.order - b.order),
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const persist = (next: ProductItemDef[]) => {
    const prev = defs;
    const normalized = withOrder(next);
    setDefs(normalized);
    startTransition(async () => {
      const res = await updateProductItemDefs(normalized);
      if (!res.ok) {
        setDefs(prev);
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
    if (j < 0 || j >= defs.length) return;
    const next = defs.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          再利用できる入力項目のライブラリです。製品種別に割り当てて使います。
        </Text>
        <CreateButton onClick={() => router.push(`${BASE}/new`)}>
          項目を追加
        </CreateButton>
      </Group>

      {defs.length === 0 && (
        <Text c="dimmed" size="sm">
          項目がありません。「項目を追加」から作成してください。
        </Text>
      )}

      {defs.map((d, i) => (
        <Paper
          key={d.key}
          p="sm"
          radius="sm"
          style={{ opacity: d.enabled ? 1 : 0.55 }}
          withBorder
        >
          <Group gap="sm" wrap="nowrap">
            <Switch
              checked={d.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = defs.slice();
                next[i] = { ...d, enabled: e.currentTarget.checked };
                persist(next);
              }}
            />
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="wrap">
                <Text fw={600} size="sm">
                  {d.label.ja || d.key}
                </Text>
                <Badge color="gray" size="xs" variant="light">
                  {typeLabel(d.type)}
                </Badge>
                {d.required && (
                  <Badge color="red" size="xs" variant="outline">
                    必須
                  </Badge>
                )}
              </Group>
              <Text
                c="dimmed"
                size="xs"
                style={{ fontFamily: "var(--mantine-font-family-monospace)" }}
              >
                {d.key}
              </Text>
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
                disabled={i === defs.length - 1 || isPending}
                onClick={() => moveRow(i, 1)}
                variant="subtle"
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="編集"
                color="blue"
                onClick={() =>
                  router.push(`${BASE}/${encodeURIComponent(d.key)}`)
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
                    title: "項目定義の削除",
                    message: `「${d.label.ja || d.key}」を削除しますか？種別への割り当ても外れます。`,
                    confirmLabel: "削除",
                    onConfirm: () => persist(defs.filter((_, k) => k !== i)),
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
          項目を追加
        </GhostButton>
      </Group>
    </Stack>
  );
}
