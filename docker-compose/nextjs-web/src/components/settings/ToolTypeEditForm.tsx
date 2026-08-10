"use client";

/**
 * ToolTypeEditForm — 工具種ごとの適用基準の編集（SY02 工具種管理のサブページ）.
 *
 * 1 つの工具種について、適用する計算基準（component/intermediate のチェック）と
 * 使用する見積単価（final 基準の選択）を設定する。実体は各基準の適用工具種
 * （toolTypes）のメンバーシップで、計算基準ページの適用工具種チップと同じ
 * データの別ビュー。保存は updateToolTypeAssignments。
 */

import {
  Alert,
  Badge,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateToolTypeAssignments } from "@/app/(dashboard)/settings/actions";
import { CancelButton, SaveButton } from "@/components/ui/buttons";
import { FormSection } from "@/components/ui/shells";
import {
  type Criterion,
  criterionAppliesTo,
  type ToolTypeDef,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine/tool-types";

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  component: { label: "加算", color: "blue" },
  intermediate: { label: "中間", color: "gray" },
};

export function ToolTypeEditForm({
  toolType,
  criteria,
  usageCount,
}: {
  toolType: ToolTypeDef;
  criteria: Criterion[];
  usageCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const nonFinal = criteria
    .filter((c) => c.role !== "final")
    .sort((a, b) => a.order - b.order);
  const finals = criteria
    .filter((c) => c.role === "final")
    .sort((a, b) => a.order - b.order);

  const [checked, setChecked] = useState<Set<string>>(
    () =>
      new Set(
        nonFinal
          .filter((c) => criterionAppliesTo(c, toolType.value))
          .map((c) => c.id),
      ),
  );
  const [finalId, setFinalId] = useState<string | null>(
    () =>
      finals.find((c) => c.enabled && criterionAppliesTo(c, toolType.value))
        ?.id ??
      finals.find((c) => criterionAppliesTo(c, toolType.value))?.id ??
      null,
  );

  const toggle = (id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const save = () => {
    if (!finalId) {
      notifications.show({
        title: "エラー",
        message: "見積単価（final）基準を選択してください",
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const res = await updateToolTypeAssignments({
        value: toolType.value,
        criterionIds: Array.from(checked),
        finalId,
      });
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: `工具種「${toolType.label}」の適用基準を更新しました`,
          color: "green",
        });
        router.push(BASE);
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
    <Stack gap="md">
      <Group gap="xs">
        <Text fw={600} size="sm">
          {toolType.label}
        </Text>
        <Text c="dimmed" ff="mono" size="xs">
          {toolType.value}
        </Text>
        {toolType.builtin ? (
          <Badge color="gray" size="xs" variant="light">
            組み込み
          </Badge>
        ) : (
          <Badge color="blue" size="xs" variant="light">
            カスタム
          </Badge>
        )}
        <Text c="dimmed" size="xs">
          試算 {usageCount} 件
        </Text>
      </Group>

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        ここでの設定は各計算基準の「適用工具種」と同じデータです（計算基準
        ページのチップと連動）。式の内容・順序は計算基準ページで編集します。
      </Alert>

      <FormSection
        description="チェックした基準がこの工具種の試算で評価されます（加算 = 合計に足す / 中間 = r.<id> で参照）。"
        title="適用する計算基準"
      >
        <Stack gap="xs">
          {nonFinal.map((c) => (
            <Checkbox
              checked={checked.has(c.id)}
              key={c.id}
              label={
                <Group gap={6} wrap="nowrap">
                  <Text size="sm">{c.name}</Text>
                  <Badge
                    color={ROLE_LABEL[c.role]?.color ?? "gray"}
                    size="xs"
                    variant="light"
                  >
                    {ROLE_LABEL[c.role]?.label ?? c.role}
                  </Badge>
                  {!c.enabled && (
                    <Badge color="gray" size="xs" variant="light">
                      無効
                    </Badge>
                  )}
                </Group>
              }
              onChange={(e) => toggle(c.id, e.currentTarget.checked)}
            />
          ))}
          {nonFinal.length === 0 && (
            <Text c="dimmed" size="sm">
              計算基準がありません。計算基準ページで作成してください。
            </Text>
          )}
        </Stack>
      </FormSection>

      <FormSection
        description="この工具種の見積単価（final）を計算する基準。工具種ごとにちょうど1つ必要です。"
        title="使用する見積単価"
      >
        <Select
          data={finals.map((c) => ({
            value: c.id,
            label: c.enabled ? c.name : `${c.name}（無効）`,
          }))}
          onChange={setFinalId}
          placeholder="final 基準を選択"
          value={finalId}
          w={320}
        />
      </FormSection>

      <Group justify="flex-end" mt="xs">
        <CancelButton onClick={() => router.push(BASE)} />
        <SaveButton loading={isPending} onClick={save}>
          保存
        </SaveButton>
      </Group>
    </Stack>
  );
}
