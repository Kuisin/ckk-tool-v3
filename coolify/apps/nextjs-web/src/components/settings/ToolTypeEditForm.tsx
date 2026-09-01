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
import {
  removeToolType,
  updateToolTypeAssignments,
} from "@/app/(dashboard)/settings/actions";
import {
  CancelButton,
  DeleteButton,
  SaveButton,
} from "@/components/ui/buttons";
import { openConfirm } from "@/components/ui/modals";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
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
        title: tr("エラー"),
        message: tr("見積単価（final）基準を選択してください"),
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
          title: tr("保存しました"),
          message: `工具種「${toolType.label}」の適用基準を更新しました`,
          color: "green",
        });
        router.push(BASE);
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

  const remove = () =>
    openConfirm({
      title: tr("工具種の削除"),
      message: `工具種「${toolType.label}」を削除します。各計算基準の適用工具種からも取り除かれます。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        startTransition(async () => {
          const res = await removeToolType(toolType.value);
          if (res.ok) {
            notifications.show({
              title: tr("削除しました"),
              message: `工具種「${toolType.label}」を削除しました`,
              color: "green",
            });
            router.push(BASE);
            router.refresh();
          } else {
            notifications.show({
              title: tr("エラー"),
              message: tr(res.error),
              color: "red",
            });
          }
        }),
    });

  // 組み込み種は削除不可。カスタム種も価格試算で使用中は削除できない。
  const deletable = !toolType.builtin && usageCount === 0;

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
            {tr("組み込み")}
          </Badge>
        ) : (
          <Badge color="blue" size="xs" variant="light">
            {tr("カスタム")}
          </Badge>
        )}
        <Text c="dimmed" size="xs">
          価格試算 {usageCount} 件
        </Text>
      </Group>

      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        {tr(
          tr(
            "ここでの設定は各計算基準の「適用工具種」と同じデータです（計算基準\n        ページのチップと連動）。式の内容・順序は計算基準ページで編集します。",
          ),
        )}
      </Alert>

      <FormSection
        description={tr(
          tr(
            "チェックした基準がこの工具種の価格試算で評価されます（加算 = 合計に足す / 中間 = r.<id> で参照）。",
          ),
        )}
        title={tr("適用する計算基準")}
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
                      {tr("無効")}
                    </Badge>
                  )}
                </Group>
              }
              onChange={(e) => toggle(c.id, e.currentTarget.checked)}
            />
          ))}
          {nonFinal.length === 0 && (
            <Text c="dimmed" size="sm">
              {tr("計算基準がありません。計算基準ページで作成してください。")}
            </Text>
          )}
        </Stack>
      </FormSection>

      <FormSection
        description={tr(
          tr(
            "この工具種の見積単価（final）を計算する基準。工具種ごとにちょうど1つ必要です。",
          ),
        )}
        title={tr("使用する見積単価")}
      >
        <Select
          data={finals.map((c) => ({
            value: c.id,
            label: c.enabled ? c.name : `${c.name}（無効）`,
          }))}
          onChange={setFinalId}
          placeholder={tr("final 基準を選択")}
          value={finalId}
          w={320}
        />
      </FormSection>

      <FormActions>
        <Group justify="space-between">
          {toolType.builtin ? (
            <span />
          ) : (
            <DeleteButton disabled={!deletable} onClick={remove} />
          )}
          <Group gap="sm">
            <CancelButton onClick={() => router.push(BASE)} />
            <SaveButton loading={isPending} onClick={save}>
              {tr("保存")}
            </SaveButton>
          </Group>
        </Group>
      </FormActions>
    </Stack>
  );
}
