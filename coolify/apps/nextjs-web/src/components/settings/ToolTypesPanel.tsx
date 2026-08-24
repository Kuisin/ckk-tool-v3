"use client";

/**
 * ToolTypesPanel — SY02 工具種管理の一覧（マスタペイン, 閲覧モード）.
 *
 * MasterListNav の共通リスト。行を選ぶと右ペイン（デスクトップ）または詳細
 * ページ（モバイル）で種ごとの適用基準（計算基準 + 見積単価）を編集する。
 * 追加はモーダル（追加後にその種の編集へ遷移）。削除は詳細ペインで行う。
 */

import { Badge, Group, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToolType } from "@/app/(dashboard)/settings/actions";
import { CreateButton } from "@/components/ui/buttons";
import { MasterListNav } from "@/components/ui/MasterListNav";
import { ModalShell } from "@/components/ui/modals";
import {
  type Criterion,
  criterionAppliesTo,
  TOOL_TYPE_VALUE,
  type ToolTypeDef,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/tool-types";

export function ToolTypesPanel({
  toolTypes,
  criteria,
  usage,
}: {
  toolTypes: ToolTypeDef[];
  criteria: Criterion[];
  /** 工具種 → 試算（estimates）の使用件数。 */
  usage: Record<string, number>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const enabled = criteria.filter((c) => c.enabled);

  const add = () => {
    const value = newValue.trim().toUpperCase();
    if (!TOOL_TYPE_VALUE.test(value)) {
      notifications.show({
        title: "エラー",
        message: "値は英大文字・数字・_（英大文字始まり）です",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await addToolType({ value, label: newLabel.trim() });
      if (res.ok) {
        notifications.show({
          title: "追加しました",
          message: `工具種「${newLabel.trim()}」を追加しました。適用する計算基準を確認してください`,
          color: "green",
        });
        setAddOpen(false);
        setNewValue("");
        setNewLabel("");
        router.push(`${BASE}/${encodeURIComponent(value)}`);
        router.refresh();
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <MasterListNav
        emptyMessage="工具種がありません。「工具種を追加」から作成してください。"
        sections={[
          {
            items: toolTypes.map((t) => {
              const used = usage[t.value] ?? 0;
              const applied = enabled.filter(
                (c) => c.role !== "final" && criterionAppliesTo(c, t.value),
              ).length;
              return {
                href: `${BASE}/${encodeURIComponent(t.value)}`,
                searchText: `${t.label} ${t.value}`,
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <Text fw={600} size="sm">
                      {t.label}
                    </Text>
                    <Text c="dimmed" ff="mono" size="xs">
                      {t.value}
                    </Text>
                    {t.builtin ? (
                      <Badge color="gray" size="xs" variant="light">
                        組み込み
                      </Badge>
                    ) : (
                      <Badge color="blue" size="xs" variant="light">
                        カスタム
                      </Badge>
                    )}
                  </Group>
                ),
                description: `計算基準 ${applied} 件 · 試算 ${used} 件`,
              };
            }),
          },
        ]}
        toolbar={
          <CreateButton onClick={() => setAddOpen(true)}>
            工具種を追加
          </CreateButton>
        }
      />

      <ModalShell
        confirmLabel="追加"
        loading={isPending}
        onClose={() => setAddOpen(false)}
        onConfirm={add}
        opened={addOpen}
        title="工具種を追加"
      >
        <Stack gap="sm">
          <Text c="dimmed" size="xs">
            追加した工具種は試算フォームの工具種として選択できます。計算入力は
            丸棒系（参照単価ベース）です。現在「全工具種」に適用中の計算基準は
            新しい種にも適用されます（追加後に調整できます）。
          </Text>
          <TextInput
            description="英大文字・数字・_（例: BALL_END）。作成後は変更できません"
            label="値"
            onChange={(e) => setNewValue(e.currentTarget.value.toUpperCase())}
            placeholder="BALL_END"
            value={newValue}
            withAsterisk
          />
          <TextInput
            label="表示名"
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder="ボールエンド"
            value={newLabel}
            withAsterisk
          />
        </Stack>
      </ModalShell>
    </>
  );
}
