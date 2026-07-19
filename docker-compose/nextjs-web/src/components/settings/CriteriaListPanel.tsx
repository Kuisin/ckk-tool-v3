"use client";

/**
 * CriteriaListPanel — SY02 計算基準の一覧（マスタペイン, 閲覧モード）.
 *
 * カード無しの NavLink リスト。「計算基準（加算・中間）」と「見積単価（final・工具種別）」
 * を分けて表示する（見積単価は工具種ごとに設定する最終基準のため別枠）。有効/無効の
 * 切替と削除は詳細ペイン（式編集）で行う。並び替えは専用ポップアップ（モーダル）で。
 * 保存は updateCriteria で即時永続化。
 */

import {
  ActionIcon,
  Badge,
  Group,
  Modal,
  NavLink,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateCriteria } from "@/app/(dashboard)/settings/actions";
import {
  CreateButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
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

const byOrder = (a: Criterion, b: Criterion) => a.order - b.order;

function withOrder(list: Criterion[]): Criterion[] {
  return list.map((c, i) => ({ ...c, order: i * 10 }));
}

function ToolTypesBadge({ c }: { c: Criterion }) {
  if (
    c.toolTypes === undefined ||
    c.toolTypes.length === TRIAL_TOOL_TYPES.length
  )
    return (
      <Badge color="teal" size="xs" variant="outline">
        全工具種
      </Badge>
    );
  if (c.toolTypes.length === 0)
    return (
      <Badge color="red" size="xs" variant="light">
        適用なし
      </Badge>
    );
  return (
    <Badge color="teal" size="xs" variant="outline">
      {c.toolTypes.map(toolLabel).join("・")}
    </Badge>
  );
}

export function CriteriaListPanel({ initial }: { initial: Criterion[] }) {
  const [criteria, setCriteria] = useState<Criterion[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const [reorderOpen, setReorderOpen] = useState(false);
  const [reorderList, setReorderList] = useState<Criterion[]>([]);

  const nonFinal = criteria.filter((c) => c.role !== "final").sort(byOrder);
  const finals = criteria.filter((c) => c.role === "final").sort(byOrder);

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

  const openReorder = () => {
    setReorderList(nonFinal.slice());
    setReorderOpen(true);
  };
  const moveReorder = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= reorderList.length) return;
    const next = reorderList.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setReorderList(next);
  };
  const saveReorder = () => {
    persist([...reorderList, ...finals]);
    setReorderOpen(false);
  };

  const renderItem = (c: Criterion) => {
    const href = `${BASE}/${encodeURIComponent(c.id)}`;
    return (
      <NavLink
        active={pathname === href}
        component={Link}
        description={
          <Group gap={4} wrap="wrap">
            <Badge color={ROLE_META[c.role].color} size="xs" variant="light">
              {ROLE_META[c.role].label}
            </Badge>
            <ToolTypesBadge c={c} />
            {!c.enabled && (
              <Badge color="gray" size="xs" variant="light">
                無効
              </Badge>
            )}
          </Group>
        }
        href={href}
        key={c.id}
        label={
          <Text
            c={c.enabled ? undefined : "dimmed"}
            fw={600}
            size="sm"
            truncate
          >
            {c.name}
          </Text>
        }
      />
    );
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <CreateButton onClick={() => router.push(`${BASE}/new`)}>
          基準を追加
        </CreateButton>
        <SecondaryButton
          disabled={nonFinal.length < 2}
          leftSection={<IconArrowsSort size={14} />}
          onClick={openReorder}
        >
          並び替え
        </SecondaryButton>
      </Group>

      {criteria.length === 0 ? (
        <Text c="dimmed" size="sm">
          計算基準がありません。「基準を追加」から作成してください。
        </Text>
      ) : (
        <>
          <Stack gap={2}>
            <Text c="dimmed" fw={600} size="xs">
              計算基準（加算・中間）
            </Text>
            {nonFinal.map(renderItem)}
          </Stack>
          <Stack gap={2}>
            <Text c="dimmed" fw={600} size="xs">
              見積単価（工具種ごとに設定）
            </Text>
            {finals.length === 0 ? (
              <Text c="dimmed" size="xs">
                見積単価の基準がありません。
              </Text>
            ) : (
              finals.map(renderItem)
            )}
          </Stack>
        </>
      )}

      <Modal
        onClose={() => setReorderOpen(false)}
        opened={reorderOpen}
        title="計算基準の並び替え"
      >
        <Stack gap="xs">
          <Text c="dimmed" size="xs">
            上から順に評価されます（加算基準の合計 → 見積単価）。
          </Text>
          {reorderList.map((c, i) => (
            <Group gap="xs" key={c.id} wrap="nowrap">
              <Text size="sm" style={{ flex: 1, minWidth: 0 }} truncate>
                {c.name}
              </Text>
              <Badge color={ROLE_META[c.role].color} size="xs" variant="light">
                {ROLE_META[c.role].label}
              </Badge>
              <ActionIcon
                aria-label="上へ"
                disabled={i === 0}
                onClick={() => moveReorder(i, -1)}
                variant="subtle"
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label="下へ"
                disabled={i === reorderList.length - 1}
                onClick={() => moveReorder(i, 1)}
                variant="subtle"
              >
                <IconArrowDown size={16} />
              </ActionIcon>
            </Group>
          ))}
          <Group justify="flex-end" mt="sm">
            <SaveButton loading={isPending} onClick={saveReorder}>
              並び順を保存
            </SaveButton>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
