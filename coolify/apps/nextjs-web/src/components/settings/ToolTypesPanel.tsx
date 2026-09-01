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
import { useTr } from "@/hooks/useTr";
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
  /** 工具種 → 価格試算（estimates）の使用件数。 */
  usage: Record<string, number>;
}) {
  const tr = useTr();
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
        title: tr("エラー"),
        message: tr("値は英大文字・数字・_（英大文字始まり）です"),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await addToolType({ value, label: newLabel.trim() });
      if (res.ok) {
        notifications.show({
          title: tr("追加しました"),
          message: tr(
            "工具種「{v0}」を追加しました。適用する計算基準を確認してください",
            { v0: newLabel.trim() },
          ),
          color: "green",
        });
        setAddOpen(false);
        setNewValue("");
        setNewLabel("");
        router.push(`${BASE}/${encodeURIComponent(value)}`);
        router.refresh();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(res.error),
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <MasterListNav
        emptyMessage={tr(
          tr("工具種がありません。「工具種を追加」から作成してください。"),
        )}
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
                        {tr("組み込み")}
                      </Badge>
                    ) : (
                      <Badge color="blue" size="xs" variant="light">
                        {tr("カスタム")}
                      </Badge>
                    )}
                  </Group>
                ),
                description: tr("計算基準 {applied} 件 · 価格試算 {used} 件", {
                  applied: applied,
                  used: used,
                }),
              };
            }),
          },
        ]}
        toolbar={
          <CreateButton onClick={() => setAddOpen(true)}>
            {tr("工具種を追加")}
          </CreateButton>
        }
      />

      <ModalShell
        confirmLabel={tr("追加")}
        loading={isPending}
        onClose={() => setAddOpen(false)}
        onConfirm={add}
        opened={addOpen}
        title={tr("工具種を追加")}
      >
        <Stack gap="sm">
          <Text c="dimmed" size="xs">
            {tr(
              tr(
                tr(
                  "追加した工具種は価格試算フォームの工具種として選択できます。計算入力は\n            丸棒系（参照単価ベース）です。現在「全工具種」に適用中の計算基準は\n            新しい種にも適用されます（追加後に調整できます）。",
                ),
              ),
            )}
          </Text>
          <TextInput
            description={tr(
              tr("英大文字・数字・_（例: BALL_END）。作成後は変更できません"),
            )}
            label={tr("値")}
            onChange={(e) => setNewValue(e.currentTarget.value.toUpperCase())}
            placeholder="BALL_END"
            value={newValue}
            withAsterisk
          />
          <TextInput
            label={tr("表示名")}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder={tr("ボールエンド")}
            value={newLabel}
            withAsterisk
          />
        </Stack>
      </ModalShell>
    </>
  );
}
