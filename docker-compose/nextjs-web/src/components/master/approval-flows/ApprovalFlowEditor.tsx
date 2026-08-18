"use client";

/**
 * ApprovalFlowEditor — 書類種別 1 つぶんの承認ステップを並べる編集画面。
 *
 * 1 段 = 名称 + 承認グループ + モード（いずれか 1 名 / 全員）。上下で並べ替え、
 * 段番号は常に 1..N に振り直す。保存するまでサーバーには触らない
 * （SY03/SY04 の SettingsReorderableList は都度保存だが、こちらは段どうしが
 * 順序で意味を持つのでまとめて保存する）。
 *
 * 変更が効くのは次の承認依頼から — 進行中の書類は依頼時点のスナップショットの
 * まま進む。画面にもそう書いておく。
 */

import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveApprovalFlow } from "@/app/(dashboard)/master/approval-settings/actions";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { type ApprovalMode, validateFlowSteps } from "@/lib/approval-flow";
import { APPROVAL_MODE_OPTIONS } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";

const BASE_PATH = "/master/approval-settings";

export interface FlowEditorStep {
  /** React key（保存時には使わない）。 */
  key: string;
  nameJa: string;
  nameEn: string;
  groupId: string | null;
  mode: ApprovalMode;
}

export interface GroupOption {
  value: string;
  label: string;
}

let seq = 0;
const nextKey = () => `step-${++seq}`;

export function ApprovalFlowEditor({
  targetType,
  targetLabel,
  initialSteps,
  groupOptions,
}: {
  targetType: string;
  targetLabel: string;
  initialSteps: Omit<FlowEditorStep, "key">[];
  groupOptions: GroupOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [steps, setSteps] = useState<FlowEditorStep[]>(() =>
    initialSteps.map((s) => ({ ...s, key: nextKey() })),
  );

  const patch = (key: string, next: Partial<FlowEditorStep>) =>
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...next } : s)),
    );

  const move = (index: number, delta: number) =>
    setSteps((prev) => {
      const to = index + delta;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const remove = (key: string) =>
    setSteps((prev) => prev.filter((s) => s.key !== key));

  const add = () =>
    setSteps((prev) => [
      ...prev,
      {
        key: nextKey(),
        nameJa: `第${prev.length + 1}承認`,
        nameEn: "",
        groupId: null,
        mode: "ANY",
      },
    ]);

  const issues = validateFlowSteps(
    steps.map((s) => ({
      nameJa: s.nameJa,
      groupId: s.groupId ? Number(s.groupId) : null,
      mode: s.mode,
    })),
  );

  const save = () => {
    if (issues.length > 0) {
      notifications.show({
        title: "エラー",
        message: issues[0],
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const result = await saveApprovalFlow(
        targetType,
        steps.map((s) => ({
          nameJa: s.nameJa.trim(),
          nameEn: s.nameEn.trim() || undefined,
          groupId: Number(s.groupId),
          mode: s.mode,
        })),
      );
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `${targetLabel}の承認フロー`,
          color: "green",
        });
        router.push(BASE_PATH);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "マスタ",
          { label: "承認設定", href: BASE_PATH },
          "承認フロー",
        ]}
        title={`${targetLabel}の承認フロー`}
      />
      <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
        変更は今後の承認依頼から適用されます。進行中の書類は依頼した時点の設定のまま進みます。
      </Alert>

      <FormSection title="承認ステップ">
        <Stack gap="sm">
          {steps.length === 0 && (
            <Text c="dimmed" size="sm">
              承認ステップがありません。「段を追加」で 1
              段以上設定してください。
            </Text>
          )}
          {steps.map((s, i) => (
            <Paper key={s.key} p="sm" radius="sm" withBorder>
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <Badge color="blue" size="lg" variant="light" w={60}>
                  第{i + 1}段
                </Badge>
                <TextInput
                  flex={1}
                  label={
                    <HelpLabel {...fieldHelp("approvalFlow", "stepName")} />
                  }
                  onChange={(e) =>
                    patch(s.key, { nameJa: e.currentTarget.value })
                  }
                  placeholder="第一承認"
                  value={s.nameJa}
                  withAsterisk
                />
                <Select
                  data={groupOptions}
                  label={<HelpLabel {...fieldHelp("approvalFlow", "group")} />}
                  onChange={(v) => patch(s.key, { groupId: v })}
                  placeholder="選択"
                  searchable
                  value={s.groupId}
                  w={200}
                  withAsterisk
                />
                <SegmentedControl
                  data={APPROVAL_MODE_OPTIONS}
                  onChange={(v) => patch(s.key, { mode: v as ApprovalMode })}
                  value={s.mode}
                />
                <Group gap={4} wrap="nowrap">
                  <ActionIcon
                    aria-label="上へ"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    variant="subtle"
                  >
                    <IconArrowUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="下へ"
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                    variant="subtle"
                  >
                    <IconArrowDown size={16} />
                  </ActionIcon>
                  <ActionIcon
                    aria-label="削除"
                    color="red"
                    onClick={() => remove(s.key)}
                    variant="subtle"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Paper>
          ))}
          <GhostButton onClick={add}>段を追加</GhostButton>
        </Stack>
      </FormSection>

      {issues.length > 0 && (
        <Text c="red" size="xs">
          {issues.join(" / ")}
        </Text>
      )}

      <FormActions
        loading={isPending}
        onCancel={() => router.push(BASE_PATH)}
        onSave={save}
      />
    </Stack>
  );
}
