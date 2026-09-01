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
  Box,
  Group,
  Paper,
  Pill,
  SegmentedControl,
  Select,
  Stack,
  Text,
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
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import { saveApprovalFlow } from "@/app/(dashboard)/master/approval-settings/actions";
import { GhostButton } from "@/components/ui/buttons";
import { HelpLabel } from "@/components/ui/HelpLabel";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchSelect } from "@/components/ui/SearchSelect";
import {
  FormActions,
  FormSection,
  LocalizedTextInput,
} from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import { type ApprovalMode, validateFlowSteps } from "@/lib/approval-flow";
import { approvalModeOptions } from "@/lib/enum-labels";
import { fieldHelp, fieldHelpTip } from "@/lib/field-help";
import {
  ApproverPermissionBadge,
  type FlowApprover,
} from "./ApproverPermissionBadge";

const BASE_PATH = "/master/approval-settings";

export interface FlowEditorStep {
  /** React key（保存時には使わない）。 */
  key: string;
  nameJa: string;
  /** 日本語以外の翻訳（LocalizedTextInput の多言語ポップアップ初期値）。 */
  nameTranslations: Record<string, string>;
  groupId: string | null;
  mode: ApprovalMode;
  /**
   * カスタム段の承認者（allowIndividual のときだけ・1..N 人）。
   * グループとどちらか一方。`allowed` は選択肢が持ってきた「承認できるか」。
   */
  approvers?: { value: string; label: string; allowed: boolean }[];
  /** カスタム段かどうか（承認者が 0 人の状態も表せるように別で持つ）。 */
  custom?: boolean;
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
  onCancel,
  onSaved,
  embedded = false,
  allowIndividual = false,
  searchApprovers,
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
      nameTranslations?: Record<string, string>;
      /** 個人宛の段では null。 */
      groupId: number | null;
      approverUserId?: string | null;
      mode: ApprovalMode;
    }[],
  ) => Promise<{ ok: boolean; error?: string }>;
  /** 保存後の遷移先。既定は承認設定の一覧。 */
  afterSaveHref?: string;
  /**
   * キャンセルの差し替え。**埋め込みでは必ず渡すこと** — 既定は承認設定
   * （MS0B）への画面遷移なので、フォームのタブの中でそのまま押すと
   * マスタ画面へ飛ばされる。
   */
  onCancel?: () => void;
  /** 保存が成功したあとに呼ぶ（埋め込みで閲覧モードへ戻すため）。 */
  onSaved?: () => void;
  /**
   * タブの中に埋め込むとき true。**ページ見出しとパンくずを出さない** —
   * 出すと、フォームの画面に「マスタ / 承認設定」への戻り先と 2 つ目のタイトルが
   * 並んで、どの画面にいるのか分からなくなる。
   */
  embedded?: boolean;
  /**
   * 段の宛先に**カスタム（この段だけの承認者）**を選べるようにする（フォームのみ）。
   * 既定は従来どおり承認グループだけ — 書類共通のフローで個人を指すと、異動の
   * たびに全書類のフローを直して回ることになる。フォームは持ち主が自分で
   * 直せるので許す。
   */
  allowIndividual?: boolean;
  /** 承認者を選ぶときの検索（allowIndividual のとき必須）。 */
  searchApprovers?: (
    query: string,
  ) => Promise<{ value: string; label: string; allowed: boolean }[]>;
}) {
  const tr = useTr();
  const locale = useLocale();
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
        nameJa: tr("第{v0}承認", { v0: prev.length + 1 }),
        nameTranslations: {},
        groupId: null,
        mode: "ANY",
      },
    ]);

  const issues = validateFlowSteps(
    steps.map((s) => ({
      nameJa: s.nameJa,
      groupId: s.custom ? null : s.groupId ? Number(s.groupId) : null,
      mode: s.mode,
      approverUserIds: s.custom ? (s.approvers ?? []).map((a) => a.value) : [],
    })),
    allowIndividual,
  );

  const save = () => {
    if (issues.length > 0) {
      notifications.show({
        title: tr("エラー"),
        message: issues[0],
        color: "red",
      });
      return;
    }
    startTransition(async () => {
      const payload = steps.map((s) => ({
        nameJa: s.nameJa.trim(),
        nameTranslations: s.nameTranslations,
        groupId: s.custom ? null : Number(s.groupId),
        approverUserIds: s.custom
          ? (s.approvers ?? []).map((a) => a.value)
          : [],
        mode: s.mode,
      }));
      const result = onSave
        ? await onSave(payload)
        : // 書類共通フロー（MS0B）は個人宛を持たない。allowIndividual が false
          // なので validateFlowSteps がグループ未選択を弾いており、ここでは
          // 必ずグループが入っている。
          await saveApprovalFlow(
            targetType,
            payload.flatMap((p) =>
              p.groupId == null
                ? []
                : [
                    {
                      nameJa: p.nameJa,
                      nameTranslations: p.nameTranslations,
                      groupId: p.groupId,
                      mode: p.mode,
                    },
                  ],
            ),
          );
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: tr("{targetLabel}の承認フロー", {
            targetLabel: targetLabel,
          }),
          color: "green",
        });
        if (afterSaveHref) router.refresh();
        else router.push(BASE_PATH);
        onSaved?.();
      } else {
        notifications.show({
          title: tr("エラー"),
          message: result.error ?? tr("保存に失敗しました"),
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
            tr("マスタ"),
            { label: tr("承認設定"), href: BASE_PATH },
            tr("承認フロー"),
          ]}
          title={tr("{targetLabel}の承認フロー", { targetLabel: targetLabel })}
        />
      )}
      {!embedded && (
        <Alert color="blue" icon={<IconInfoCircle size={16} />} variant="light">
          {tr(
            tr(
              tr(
                "変更は今後の承認依頼から適用されます。進行中の書類は依頼した時点の設定のまま進みます。",
              ),
            ),
          )}
        </Alert>
      )}
      <Alert
        color="gray"
        icon={<IconShieldCheck size={16} />}
        title={tr("承認に必要な権限")}
        variant="light"
      >
        <Text size="sm">
          {targetLabel}の承認・差し戻しには、「{permissionLabel}
          」を閲覧または編集できる権限（
          <Text component="span" ff="mono" size="sm">
            {permissionCode}:READ / UPDATE
          </Text>
          ）が要ります。誰が承認するかは、この画面で指定した
          {allowIndividual ? "承認グループ・承認者" : tr("承認グループ")}
          だけで決まります。書類を開けない人は、指定しても承認できません
          （権限はユーザー管理 SY01 のロールで決まります）。
        </Text>
      </Alert>

      <FormSection title={tr("承認ステップ")}>
        <Stack gap="sm">
          {steps.length === 0 && (
            <Text c="dimmed" size="sm">
              {tr(
                tr(
                  tr(
                    "承認ステップがありません。「段を追加」で 1\n              段以上設定してください。",
                  ),
                ),
              )}
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
              <Box flex={isMobile ? undefined : 1} miw={0}>
                <LocalizedTextInput
                  help={fieldHelpTip("approvalFlow", "stepName")}
                  jaProps={{
                    value: s.nameJa,
                    onChange: (e) =>
                      patch(s.key, { nameJa: e.currentTarget.value }),
                  }}
                  label={tr("名称")}
                  placeholder={tr("第一承認")}
                  required
                  translationsProps={{
                    value: s.nameTranslations,
                    onChange: (v: Record<string, string>) =>
                      patch(s.key, { nameTranslations: v }),
                  }}
                />
              </Box>
            );
            const individual = !!s.custom;
            const groupField = (
              <Select
                data={groupOptions}
                label={<HelpLabel {...fieldHelp("approvalFlow", "group")} />}
                onChange={(v) => patch(s.key, { groupId: v })}
                placeholder={tr("選択")}
                searchable
                value={s.groupId}
                w={isMobile ? undefined : 200}
                withAsterisk
              />
            );
            const chosen = s.approvers ?? [];
            const individualField = searchApprovers && (
              <Stack gap={4} w={isMobile ? undefined : 260}>
                <SearchSelect
                  label={tr("承認者（複数可）")}
                  onChange={(v, option) => {
                    if (!v || chosen.some((a) => a.value === v)) return;
                    patch(s.key, {
                      approvers: [
                        ...chosen,
                        {
                          value: v,
                          label: option?.label ?? v,
                          allowed:
                            (option as { allowed?: boolean } | undefined)
                              ?.allowed ?? false,
                        },
                      ],
                    });
                  }}
                  onSearch={async (q) => {
                    const rows = (await searchApprovers(q)) ?? [];
                    // すでに選んだ人は候補から外す（押しても増えないので迷う）。
                    return rows
                      .filter((r) => !chosen.some((a) => a.value === r.value))
                      .map((r) => ({
                        value: r.value,
                        label: r.allowed
                          ? r.label
                          : tr("{label}（承認権限なし）", { label: r.label }),
                        allowed: r.allowed,
                      }));
                  }}
                  placeholder={tr("検索して追加")}
                  storageKey="form-approver"
                  value={null}
                />
                <Group gap={4}>
                  {chosen.map((a) => (
                    <Pill
                      key={a.value}
                      onRemove={() =>
                        patch(s.key, {
                          approvers: chosen.filter((x) => x.value !== a.value),
                        })
                      }
                      withRemoveButton
                    >
                      {a.label}
                    </Pill>
                  ))}
                </Group>
              </Stack>
            );
            const targetToggle = allowIndividual && (
              <SegmentedControl
                data={[
                  { value: "group", label: tr("グループ") },
                  { value: "custom", label: tr("カスタム") },
                ]}
                fullWidth={isMobile}
                onChange={(v) =>
                  // 切り替えたら反対側は必ず捨てる（両方入った状態を作らない）。
                  patch(
                    s.key,
                    v === "custom"
                      ? { custom: true, groupId: null }
                      : { custom: false, approvers: [] },
                  )
                }
                value={individual ? "custom" : "group"}
              />
            );
            const modeField = (
              <SegmentedControl
                data={approvalModeOptions(locale)}
                fullWidth={isMobile}
                onChange={(v) => patch(s.key, { mode: v as ApprovalMode })}
                value={s.mode}
              />
            );
            // 選んだグループの「今この瞬間に承認できる人」と、その権限の有無。
            // 入力行の下に置く — 行の中に入れると入力欄の高さが揃わなくなる。
            const approvers = individual
              ? chosen.map((a) => ({
                  userId: a.value,
                  displayName: a.label,
                  allowed: a.allowed,
                  unrestricted: false,
                  scopes: [],
                }))
              : s.groupId
                ? (approversByGroup[s.groupId] ?? [])
                : null;
            const approverRow = approvers && (
              <Group gap="xs" wrap="wrap">
                <Text c="dimmed" size="xs">
                  {tr("この段を承認できる人")}
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
                  aria-label={tr("上へ")}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  size={isMobile ? "lg" : undefined}
                  variant="subtle"
                >
                  <IconArrowUp size={16} />
                </ActionIcon>
                <ActionIcon
                  aria-label={tr("下へ")}
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
                    {targetToggle}
                    {individual ? individualField : groupField}
                    {/* カスタムでも 1 人なら「いずれか / 全員」は同じ意味なので出さない */}
                    {(!individual || chosen.length > 1) && modeField}
                    {approverRow}
                  </Stack>
                ) : (
                  <Stack gap="xs">
                    <Group align="flex-end" gap="sm" wrap="nowrap">
                      {stepBadge}
                      {nameField}
                      {targetToggle}
                      {individual ? individualField : groupField}
                      {(!individual || chosen.length > 1) && modeField}
                      {controls}
                    </Group>
                    {approverRow}
                  </Stack>
                )}
              </Paper>
            );
          })}
          <GhostButton fullWidth={isMobile} onClick={add}>
            {tr("段を追加")}
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
        onCancel={onCancel ?? (() => router.push(BASE_PATH))}
        onSave={save}
      />
    </Stack>
  );
}
