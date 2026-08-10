"use client";

/**
 * ToolTypesPanel — SY02 工具種管理の一覧（/settings/trial-pricing-engine/tool-types）.
 *
 * 工具種（管理者定義）の追加・削除と、種ごとの適用基準サマリを表示する。
 * 組み込み 3 種（丸棒/円筒/OH付）は削除不可。カスタム種は試算で未使用の
 * 場合のみ削除できる（使用中は件数を表示して無効化）。各行のクリックで
 * 種ごとの適用基準（計算基準 + 見積単価）の編集ページへ。
 */

import { Badge, Card, Group, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addToolType,
  removeToolType,
} from "@/app/(dashboard)/settings/actions";
import { CreateButton, DeleteButton } from "@/components/ui/buttons";
import { ModalShell, openConfirm } from "@/components/ui/modals";
import {
  type Criterion,
  criterionAppliesTo,
  TOOL_TYPE_VALUE,
  type ToolTypeDef,
} from "@/lib/trial-pricing-criteria";
import classes from "./SettingsReorderableList.module.css";

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

  const remove = (t: ToolTypeDef) =>
    openConfirm({
      title: "工具種の削除",
      message: `工具種「${t.label}」を削除します。各計算基準の適用工具種からも取り除かれます。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        startTransition(async () => {
          const res = await removeToolType(t.value);
          if (res.ok) {
            notifications.show({
              title: "削除しました",
              message: `工具種「${t.label}」を削除しました`,
              color: "green",
            });
            router.refresh();
          } else {
            notifications.show({
              title: "エラー",
              message: res.error,
              color: "red",
            });
          }
        }),
    });

  return (
    <Stack gap="md" maw={960}>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Text c="dimmed" size="sm">
          工具種ごとに適用する計算基準・見積単価は各行から設定します。
        </Text>
        <CreateButton
          onClick={() => setAddOpen(true)}
          style={{ flexShrink: 0 }}
        >
          工具種を追加
        </CreateButton>
      </Group>

      <Stack gap="sm">
        {toolTypes.map((t) => {
          const used = usage[t.value] ?? 0;
          const applied = enabled.filter(
            (c) => c.role !== "final" && criterionAppliesTo(c, t.value),
          ).length;
          const finalName =
            enabled.find(
              (c) => c.role === "final" && criterionAppliesTo(c, t.value),
            )?.name ?? "—";
          return (
            <Card
              className={classes.row}
              key={t.value}
              padding="md"
              radius="md"
              withBorder
            >
              <Group justify="space-between" wrap="nowrap">
                <Link
                  className={classes.body}
                  href={`${BASE}/${encodeURIComponent(t.value)}`}
                >
                  <Stack gap={4}>
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
                    <Group gap="md">
                      <Text c="dimmed" size="xs">
                        計算基準 {applied} 件 / 見積単価: {finalName}
                      </Text>
                      <Text c={used > 0 ? undefined : "dimmed"} size="xs">
                        試算 {used} 件
                      </Text>
                    </Group>
                  </Stack>
                </Link>
                <Group gap="xs" style={{ flexShrink: 0 }}>
                  {!t.builtin && (
                    <DeleteButton
                      disabled={used > 0}
                      loading={isPending}
                      onClick={() => remove(t)}
                      variant="outline"
                    />
                  )}
                  <IconChevronRight size={18} />
                </Group>
              </Group>
            </Card>
          );
        })}
      </Stack>

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
    </Stack>
  );
}
