"use client";

/**
 * CriteriaListPanel — SY02 計算基準の一覧（マスタペイン, 閲覧モード）.
 *
 * MasterListNav の共通リスト。「計算基準（加算・中間）」と「見積単価（final・
 * 工具種別）」をセクションで分けて表示する。有効/無効の切替と削除は詳細ペイン
 * （式編集）で行う。並び替えは専用モーダルで、updateCriteria で即時永続化。
 */

import { ActionIcon, Badge, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowsSort,
  IconArrowUp,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateCriteria } from "@/app/(dashboard)/settings/actions";
import {
  CreateButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import {
  MasterListNav,
  type MasterNavItem,
} from "@/components/ui/MasterListNav";
import { useTr } from "@/hooks/useTr";
import type {
  Criterion,
  CriterionRole,
  ToolTypeDef,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/criteria";

const ROLE_META: Record<CriterionRole, { label: string; color: string }> = {
  component: { label: "加算", color: "blue" },
  intermediate: { label: "中間", color: "gray" },
  final: { label: "見積単価", color: "green" },
};

const byOrder = (a: Criterion, b: Criterion) => a.order - b.order;

function withOrder(list: Criterion[]): Criterion[] {
  return list.map((c, i) => ({ ...c, order: i * 10 }));
}

function ToolTypesBadge({
  c,
  toolTypes,
}: {
  c: Criterion;
  toolTypes: ToolTypeDef[];
}) {
  const tr = useTr();
  const toolLabel = (v: string) =>
    toolTypes.find((t) => t.value === v)?.label ?? v;
  if (
    c.toolTypes === undefined ||
    toolTypes.every((t) => c.toolTypes?.includes(t.value))
  )
    return (
      <Badge color="teal" size="xs" variant="outline">
        {tr("全工具種")}
      </Badge>
    );
  if (c.toolTypes.length === 0)
    return (
      <Badge color="red" size="xs" variant="light">
        {tr("適用なし")}
      </Badge>
    );
  return (
    <Badge color="teal" size="xs" variant="outline">
      {c.toolTypes.map(toolLabel).join(tr("・"))}
    </Badge>
  );
}

export function CriteriaListPanel({
  initial,
  toolTypes,
}: {
  initial: Criterion[];
  /** 工具種（管理者定義）— 適用バッジの表示に使う。 */
  toolTypes: ToolTypeDef[];
}) {
  const tr = useTr();
  const [criteria, setCriteria] = useState<Criterion[]>(initial);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
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
          title: tr("エラー"),
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

  const toItem = (c: Criterion): MasterNavItem => ({
    href: `${BASE}/${encodeURIComponent(c.id)}`,
    searchText: `${c.name} ${c.id}`,
    label: (
      <Text c={c.enabled ? undefined : "dimmed"} fw={600} size="sm" truncate>
        {c.name}
      </Text>
    ),
    description: (
      <Group gap={4} wrap="wrap">
        <Badge color={ROLE_META[c.role].color} size="xs" variant="light">
          {ROLE_META[c.role].label}
        </Badge>
        <ToolTypesBadge c={c} toolTypes={toolTypes} />
        {!c.enabled && (
          <Badge color="gray" size="xs" variant="light">
            {tr("無効")}
          </Badge>
        )}
      </Group>
    ),
  });

  return (
    <>
      <MasterListNav
        emptyMessage={tr(
          tr("計算基準がありません。「基準を追加」から作成してください。"),
        )}
        searchable
        searchPlaceholder={tr("基準名・ID で絞り込み...")}
        sections={[
          {
            label: tr("計算基準（加算・中間）"),
            items: nonFinal.map(toItem),
          },
          {
            label: tr("見積単価（工具種ごとに設定）"),
            items: finals.map(toItem),
            emptyMessage: tr("見積単価の基準がありません。"),
          },
        ]}
        toolbar={
          <Group gap="xs">
            <CreateButton onClick={() => router.push(`${BASE}/new`)}>
              {tr("基準を追加")}
            </CreateButton>
            <SecondaryButton
              disabled={nonFinal.length < 2}
              leftSection={<IconArrowsSort size={14} />}
              onClick={openReorder}
            >
              {tr("並び替え")}
            </SecondaryButton>
          </Group>
        }
      />

      <Modal
        onClose={() => setReorderOpen(false)}
        opened={reorderOpen}
        title={tr("計算基準の並び替え")}
      >
        <Stack gap="xs">
          <Text c="dimmed" size="xs">
            {tr("上から順に評価されます（加算基準の合計 → 見積単価）。")}
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
                aria-label={tr("上へ")}
                disabled={i === 0}
                onClick={() => moveReorder(i, -1)}
                variant="subtle"
              >
                <IconArrowUp size={16} />
              </ActionIcon>
              <ActionIcon
                aria-label={tr("下へ")}
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
              {tr("並び順を保存")}
            </SaveButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
