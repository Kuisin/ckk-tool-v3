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
 *
 * 段ごとに、選んだ承認グループのメンバーがこの書類を閲覧・編集できるか
 * （<code>:READ / UPDATE — 承認の RBAC 要件）を出す。書類を開けない人は
 * グループに入れても承認できないので、保存する前にここで気づけるようにする。
 *
 * レイアウト（design.md §20.2）: デスクトップは 1 段 = 1 行。モバイルは
 * 同じものを縦に積む — 入力 3 つ + 操作 3 つを 1 行に並べると 375px では
 * 収まらず、横スクロールか潰れた入力欄になるため。段番号と並べ替え・削除は
 * 見出し行にまとめ、入力は全幅にする。
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
  IconShieldCheck,
  IconTrash,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveApprovalFlow } from "@/app/(dashboard)/master/approval-settings/actions";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormActions, FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { type ApprovalMode, validateFlowSteps } from "@/lib/approval-flow";

import { APPROVAL_MODE_OPTIONS } from "@/lib/enum-labels";
import { fieldHelp } from "@/lib/field-help";
import {
  ApproverPermissionBadge,
  type FlowApprover,
} from "./ApproverPermissionBadge";

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
  approversByGroup,
  permissionCode,
  permissionLabel,
  rulesSection,
  applyModeSection,
  onSave,
  afterSaveHref,
  embedded = false,
}: {
  targetType: string;
  targetLabel: string;
  initialSteps: Omit<FlowEditorStep, "key">[];
  groupOptions: GroupOption[];
  /** グループ id（文字列）→ 今そのグループで承認できる人 + 権限の有無。 */
  approversByGroup: Record<string, FlowApprover[]>;
  /** この書類の承認に必要な権限コード。 */
  permissionCode: string;
  permissionLabel: string;
  /** 条件付きフロー（ApprovalFlowRulesSection）— 既定フローの下に出す。 */
  rulesSection?: React.ReactNode;
  /** 適用モード設定（ApplyModeControl）— 対応 target のみ既定フローの下に出す。 */
  applyModeSection?: React.ReactNode;
  /**
   * 保存の差し替え。既定は書類共通フロー（MS0B）の保存。フォームは
   * **フォームごと**にフローを持つので、その保存を渡して同じ編集画面を使う。
   */
  onSave?: (
    steps: {
      nameJa: string;
      nameEn?: string;
      groupId: number;
      mode: ApprovalMode;
    }[],
  ) => Promise<{ ok: boolean; error?: string }>;
  /** 保存後の遷移先。既定は承認設定の一覧。 */
  afterSaveHref?: string;
  /**
   * タブの中に埋め込むとき true。**ページ見出しとパンくずを出さない** —
   * 出すと、フォームの画面に「マスタ / 承認設定」への戻り先と 2 つ目のタイトルが
   * 並んで、どの画面にいるのか分からなくなる。
   */
  embedded?: boolean;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
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
      const payload = steps.map((s) => ({
        nameJa: s.nameJa.trim(),
        nameEn: s.nameEn.trim() || undefined,
        groupId: Number(s.groupId),
        mode: s.mode,
      }));
      const result = onSave
        ? await onSave(payload)
        : await saveApprovalFlow(targetType, payload);
      if (result.ok) {
        notifications.show({
          title: "保存しました",
          message: `${targetLabel}の承認フロー`,
          color: "green",
        });
        if (afterSaveHref) router.refresh();
        else router.push(BASE_PATH);
      } else {
        notifications.show({
          title: "エラー",
          message: result.error ?? "保存に失敗しました",
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      {!embedded && (
        <PageHeader
          breadcrumbs={[
            "マスタ",
            { label: "承認設定", href: BASE_PATH },
            "承認フロー",
          ]}
          title={`${targetLabel}の承認フロー`}
        />
      )}
      {!embedded && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          変更は今後の承認依頼から適用されます。進行中の書類は依頼した時点の設定のまま進みます。
        </Alert>
      )}
      <Alert
        color="gray"
        icon={<IconShieldCheck size={16} />}
        title="承認に必要な権限"
        variant="light"
      >
        <Text size="sm">
          {targetLabel}の承認・差し戻しには、「{permissionLabel}
          」を閲覧または編集できる権限（
          <Text component="span" ff="mono" size="sm">
            {permissionCode}:READ / UPDATE
          </Text>
          ）が要ります。誰が承認するかは、この画面の承認グループだけで
          決まります。書類を開けない人は、承認グループに入れても承認できません
          （権限はユーザー管理 SY01 のロールで決まります）。
        </Text>
      </Alert>

      <FormSection title="承認ステップ">
        <Stack gap="sm">
          {steps.length === 0 && (
            <Text c="dimmed" size="sm">
              承認ステップがありません。「段を追加」で 1
              段以上設定してください。
            </Text>
          )}
          {steps.map((s, i) => {
            // 入力と操作はレイアウト間で共有する（2 つ書くと片方だけ直す事故になる）
            const stepBadge = (
              <Badge
                color="blue"
                size="lg"
                variant="light"
                w={isMobile ? undefined : 60}
              >
                第{i + 1}段
              </Badge>
            );
            const nameField = (
              <TextInput
                flex={isMobile ? undefined : 1}
                label={<HelpLabel {...fieldHelp("approvalFlow", "stepName")} />}
                onChange={(e) =>
                  patch(s.key, { nameJa: e.currentTarget.value })
                }
                placeholder="第一承認"
                value={s.nameJa}
                withAsterisk
              />
            );
            const groupField = (
              <Select
                data={groupOptions}
                label={<HelpLabel {...fieldHelp("approvalFlow", "group")} />}
                onChange={(v) => patch(s.key, { groupId: v })}
                placeholder="選択"
                searchable
                value={s.groupId}
                w={isMobile ? undefined : 200}
                withAsterisk
              />
            );
            const modeField = (
              <SegmentedControl
                data={APPROVAL_MODE_OPTIONS}
                fullWidth={isMobile}
                onChange={(v) => patch(s.key, { mode: v as ApprovalMode })}
                value={s.mode}
              />
            );
            // 選んだグループの「今この瞬間に承認できる人」と、その権限の有無。
            // 入力行の下に置く — 行の中に入れると入力欄の高さが揃わなくなる。
            const approvers = s.groupId
              ? (approversByGroup[s.groupId] ?? [])
              : null;
            const approverRow = approvers && (
              <Group gap="xs" wrap="wrap">
                <Text c="dimmed" size="xs">
                  この段を承認できる人
                </Text>
                <ApproverPermissionBadge approvers={approvers} />
                {approvers.length > 0 && (
                  <Text c="dimmed" size="xs">
                    {approvers.map((a) => a.displayName).join("、")}
                  </Text>
                )}
              </Group>
            );
            const controls = (
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  aria-label="上へ"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  size={isMobile ? "lg" : undefined}
                  variant="subtle"
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label="下へ"
                  disabled={i === steps.length - 1}
                  onClick={() => move(i, 1)}
                  size={isMobile ? "lg" : undefined}
                  variant="subtle"
                >
                  <IconArrowDown size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label="削除"
                  color="red"
                  onClick={() => remove(s.key)}
                  size={isMobile ? "lg" : undefined}
                  variant="subtle"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
            );

            return (
              <Paper key={s.key} p="sm" radius="sm" withBorder>
                {isMobile ? (
                  <Stack gap="sm">
                    {/* 段番号と並べ替え・削除を見出し行にまとめる */}
                    <Group justify="space-between" wrap="nowrap">
                      {stepBadge}
                      {controls}
                    </Group>
                    {nameField}
                    {groupField}
                    {modeField}
                    {approverRow}
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <Group align="flex-end" gap="sm" wrap="nowrap">
                      {stepBadge}
                      {nameField}
                      {groupField}
                      {modeField}
                      {controls}
                    </Group>
                    {approverRow}
                  </Stack>
                )}
              </Paper>
            );
          })}
          <GhostButton fullWidth={isMobile} onClick={add}>
            段を追加
          </GhostButton>
        </Stack>
      </FormSection>

      {/* 適用モード（PRE/POST）— 保存は独立・即時反映 */}
      {applyModeSection}

      {/* 条件付きフロー — 保存は独立（このページの保存ボタンは既定フローのみ） */}
      {rulesSection}

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
