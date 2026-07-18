"use client";

/**
 * CriteriaListPanel — SY02 メインの計算基準リスト.
 *
 * 一覧表示のみ（有効切替・並び替え・削除・追加）。個別の式編集は
 * /settings/trial-pricing-engine/criteria/[id] の編集ページで行う。
 * リスト操作は updateCriteria で即時保存する（メインのスカラー保存とは独立）。
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
import { updateCriteria } from "@/app/(dashboard)/settings/actions";
import { CreateButton, GhostButton } from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { TOOL_TYPE_OPTIONS } from "@/lib/trial-pricing";
import {
  type Criterion,
  type CriterionRole,
  TRIAL_TOOL_TYPES,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/criteria";

const ROLE_META: Record<CriterionRole, { label: string; color: string }> = {
  component: { label: "加算", color: "blue" },
  intermediate: { label: "中間", color: "gray" },
  final: { label: "見積単価", color: "green" },
};

const toolLabel = (v: string) =>
  TOOL_TYPE_OPTIONS.find((o) => o.value === v)?.label ?? v;

function withOrder(list: Criterion[]): Criterion[] {
  return list.map((c, i) => ({ ...c, order: i * 10 }));
}

export function CriteriaListPanel({ initial }: { initial: Criterion[] }) {
  const [criteria, setCriteria] = useState<Criterion[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // 楽観的更新 + 永続化。失敗時は元に戻す。
  const persist = (next: Criterion[]) => {
    const prev = criteria;
    const normalized = withOrder(next);
    setCriteria(normalized);
    startTransition(async () => {
      const res = await updateCriteria(normalized);
      if (!res.ok) {
        setCriteria(prev);
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
    if (j < 0 || j >= criteria.length) return;
    const next = criteria.slice();
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          見積単価 = 加算基準の合計 → final
          基準で確定。式の編集は各行の「編集」から。
        </Text>
        <CreateButton onClick={() => router.push(`${BASE}/new`)}>
          基準を追加
        </CreateButton>
      </Group>

      {criteria.length === 0 && (
        <Text c="dimmed" size="sm">
          計算基準がありません。「基準を追加」から作成してください。
        </Text>
      )}

      {criteria.map((c, i) => (
        <Paper
          key={c.id}
          p="sm"
          radius="sm"
          style={{ opacity: c.enabled ? 1 : 0.55 }}
          withBorder
        >
          <Group gap="sm" wrap="nowrap">
            <Switch
              checked={c.enabled}
              disabled={isPending}
              onChange={(e) => {
                const next = criteria.slice();
                next[i] = { ...c, enabled: e.currentTarget.checked };
                persist(next);
              }}
            />
            <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="wrap">
                <Text fw={600} size="sm">
                  {c.name}
                </Text>
                <Badge
                  color={ROLE_META[c.role].color}
                  size="xs"
                  variant="light"
                >
                  {ROLE_META[c.role].label}
                </Badge>
                {c.toolTypes === undefined ||
                c.toolTypes.length === TRIAL_TOOL_TYPES.length ? (
                  <Badge color="teal" size="xs" variant="outline">
                    全工具種
                  </Badge>
                ) : c.toolTypes.length === 0 ? (
                  <Badge color="red" size="xs" variant="light">
                    適用なし
                  </Badge>
                ) : (
                  <Badge color="teal" size="xs" variant="outline">
                    {c.toolTypes.map(toolLabel).join("・")}
                  </Badge>
                )}
              </Group>
              <Text
                c="dimmed"
                size="xs"
                style={{
                  fontFamily: "var(--mantine-font-family-monospace)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {c.expression.replace(/\s+/g, " ").trim() || "—"}
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
                disabled={i === criteria.length - 1 || isPending}
                onClick={() => moveRow(i, 1)}
                variant="subtle"
              >
                <IconArrowDown size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="編集"
                color="blue"
                onClick={() =>
                  router.push(`${BASE}/${encodeURIComponent(c.id)}`)
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
                    title: "計算基準の削除",
                    message: `「${c.name}」を削除しますか？`,
                    confirmLabel: "削除",
                    onConfirm: () =>
                      persist(criteria.filter((_, k) => k !== i)),
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
          基準を追加
        </GhostButton>
      </Group>
    </Stack>
  );
}
