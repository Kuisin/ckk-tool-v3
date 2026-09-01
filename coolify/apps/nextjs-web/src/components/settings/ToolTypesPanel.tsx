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
import { useTranslations } from "next-intl";
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
  /** 工具種 → 価格試算（estimates）の使用件数。 */
  usage: Record<string, number>;
}) {
  const tr = useTranslations();
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
        title: tr("common.error2"),
        message: tr(
          "settings.toolTypesPanel.useUppercaseLettersDigitsAndStarting",
        ),
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await addToolType({ value, label: newLabel.trim() });
      if (res.ok) {
        notifications.show({
          title: tr("common.added"),
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
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <>
      <MasterListNav
        emptyMessage={tr("settings.toolTypesPanel.thereAreNoToolTypesCreate")}
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
                        {tr("common.builtIn")}
                      </Badge>
                    ) : (
                      <Badge color="blue" size="xs" variant="light">
                        {tr("common.custom")}
                      </Badge>
                    )}
                  </Group>
                ),
                description: `計算基準 ${applied} 件 · 価格試算 ${used} 件`,
              };
            }),
          },
        ]}
        toolbar={
          <CreateButton onClick={() => setAddOpen(true)}>
            {tr("settings.toolTypesPanel.addAToolType")}
          </CreateButton>
        }
      />

      <ModalShell
        confirmLabel={tr("common.add")}
        loading={isPending}
        onClose={() => setAddOpen(false)}
        onConfirm={add}
        opened={addOpen}
        title={tr("settings.toolTypesPanel.addAToolType")}
      >
        <Stack gap="sm">
          <Text c="dimmed" size="xs">
            {tr("settings.toolTypesPanel.toolTypesYouAddBecomeSelectable")}
          </Text>
          <TextInput
            description={tr(
              "settings.toolTypesPanel.uppercaseLettersDigitsAndEG",
            )}
            label={tr("common.value")}
            onChange={(e) => setNewValue(e.currentTarget.value.toUpperCase())}
            placeholder="BALL_END"
            value={newValue}
            withAsterisk
          />
          <TextInput
            label={tr("common.displayName")}
            onChange={(e) => setNewLabel(e.currentTarget.value)}
            placeholder={tr("settings.toolTypesPanel.ballEnd")}
            value={newLabel}
            withAsterisk
          />
        </Stack>
      </ModalShell>
    </>
  );
}
