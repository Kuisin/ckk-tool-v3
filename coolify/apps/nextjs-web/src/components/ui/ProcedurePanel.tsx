"use client";

/**
 * ProcedurePanel — 書類の手続き状況（作成 → … → 完了）の共通パネル。
 *
 * **ライフサイクルを持つ書類の進捗表示はこれ 1 つ**（価格試算 / 見積書 / 注文請書 /
 * 注文明細 / 設計依頼書 / 購買依頼 / 素材発注書 / 指示書 / 出荷書 / 納品書 /
 * 請求書 / 締日処理）。以前は 3 通りに割れていた — このパネル・生の `<Stepper>`
 * の手書き・進捗表示なし — ので、書類ごとに進捗を探す場所が違っていた。
 * 新しい書類を足すときも生の Stepper を書かず、ここへ段を渡すこと。
 *
 * 1 枚で前後関係まで追えるように、3 段構成にしてある:
 *
 *   前の書類から … `sourceGroups`   — どこから来たか（見積書 ← / 出荷書 ← …）
 *   Stepper      … `stages`           — いまどの段か（段ごとの状態）
 *   次の書類へ   … `handoffGroups`  — どこへ渡ったか（済/未 バッジ付き）
 *
 * 段の組み立ては書類ごとの呼び出し側が `procedureStages()`
 * （lib/procedure-stage.ts — 純ロジック・試験あり）で行い、ここは表示のみ。
 * **段は自分の状態を名乗る**（done / current / pending / skipped）ので、
 * このパネルは index の大小から状態を逆算しない — 逆算していた頃は
 * 「済んだ段にスピナー」が書類ごとに起きた（納品書の「発行」）。
 *
 * 見出し（`title`）は既定の「手続き状況」のまま使う — 書類ごとに
 * 「承認・発注状況」などと変えると、統一した意味が無くなる。
 */

import {
  Alert,
  Anchor,
  Badge,
  Group,
  Paper,
  Stack,
  Stepper,
  Text,
  Title,
} from "@mantine/core";
import { IconBan, IconMinus } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type ApprovalPhase,
  approvalStepDescription,
} from "@/lib/approval-flow";
import type { Tr } from "@/lib/i18n";
import {
  activeStageIndex,
  type ProcedureStage,
  type ProcedureStageDef,
  type ProcedureStageState,
} from "@/lib/procedure-stage";

export type {
  ProcedureStage,
  ProcedureStageDef,
  ProcedureStageState,
} from "@/lib/procedure-stage";
export { procedureStages } from "@/lib/procedure-stage";

export interface HandoffItem {
  key: string;
  /** 書類番号など。 */
  label: string;
  href?: string;
  /**
   * 後続へ渡り切ったか（済/未 バッジ）。**undefined ならバッジを出さない** —
   * 上流（前の書類）は「済/未」で語る対象ではないため。
   */
  done?: boolean;
  /** 状態や数量の補足（「出荷済・10 本」など）。 */
  note?: string | null;
}

export interface HandoffGroup {
  key: string;
  /** 「指示書（製造手配）」「出荷書」「納品書」など。 */
  title: string;
  /** 進捗サマリ（「手配済 8 / 受注 10」など）。 */
  summary?: string | null;
  items: HandoffItem[];
  /** items が空のときの文言（「未手配」など）。 */
  emptyNote: string;
}

/**
 * 承認フローの 1 段を作る（承認を持つ書類の共通形）。状態は付けない —
 * 他の段と一緒に `procedureStages()` へ渡す。
 *
 * 承認済みなら承認日、進行中なら「2/3 部門承認」——段数は承認設定 (MS0B) が
 * 決めるので、文言は `approvalStepDescription`（lib/approval-flow.ts）が唯一の
 * 定義。差し戻し中は赤にする（_specs/design.md §9 の REJECTED = red）。
 */
export function approvalStage(
  approval: {
    phase: ApprovalPhase;
    stepNo: number;
    stepCount: number;
    stepLabel: string;
    groupLabel: string;
  },
  opts: {
    /** 承認完了日時（あればそれを説明に出す）。 */
    approvedAt?: string | null;
    /** 段の名前（既定「承認」）。 */
    label?: string;
    /** 呼び出し側の日付フォーマッタ（useFormat の fmt.date）。 */
    fmtDate: (v: string | null) => string;
    /** 呼び出し側の `useTranslations()`（既定の段名「承認」を訳すため）。 */
    tr: Tr;
  },
): ProcedureStageDef {
  return {
    key: "approval",
    label: opts.label ?? opts.tr("common.approve"),
    description: opts.approvedAt
      ? opts.fmtDate(opts.approvedAt)
      : approvalStepDescription(approval, opts.tr),
    color: approval.phase === "REJECTED" ? "red" : undefined,
  };
}

/** 前後の書類リンク群（「前の書類から」/「次の書類へ」で使い回す）。 */
function LinkGroups({
  heading,
  groups,
}: {
  heading: string;
  groups: HandoffGroup[];
}) {
  const tr = useTranslations();
  return (
    <Stack gap="sm" mt="md">
      <Text c="dimmed" fw={600} size="sm">
        {heading}
      </Text>
      {groups.map((g) => (
        <Stack gap={4} key={g.key}>
          <Group gap="sm">
            <Text fw={600} size="sm">
              {g.title}
            </Text>
            {g.summary && (
              <Text c="dimmed" className="tabular-nums" size="xs">
                {g.summary}
              </Text>
            )}
          </Group>
          {g.items.length === 0 ? (
            <Text c="dimmed" size="sm">
              {g.emptyNote}
            </Text>
          ) : (
            <Stack gap={4}>
              {g.items.map((it) => (
                <Group gap="sm" key={it.key} wrap="nowrap">
                  {it.done !== undefined && (
                    <Badge
                      color={it.done ? "green" : "gray"}
                      size="sm"
                      variant="light"
                    >
                      {it.done ? "済" : tr("ui.procedurePanel.notYet")}
                    </Badge>
                  )}
                  {it.href ? (
                    <Anchor component={Link} href={it.href} size="sm">
                      <Text ff="mono" inherit span>
                        {it.label}
                      </Text>
                    </Anchor>
                  ) : (
                    <Text ff="mono" size="sm">
                      {it.label}
                    </Text>
                  )}
                  {it.note && (
                    <Text c="dimmed" size="xs">
                      {it.note}
                    </Text>
                  )}
                </Group>
              ))}
            </Stack>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

/** まだ / もう通らない段は灰。済んだ段は既定の色（青）のまま。 */
const GRAY_STATES = new Set<ProcedureStageState>(["pending", "skipped"]);

/**
 * 状態 → アイコン。**1 状態 = 1 アイコン**で、重ねない。
 *
 *   done     Mantine 既定のチェック（`completedIcon` を渡さない）
 *   current  Mantine のスピナー（`loading`）
 *   pending  段の番号（アイコン無しの既定）
 *   skipped  横棒
 */
const STATE_ICON: Record<ProcedureStageState, React.ReactNode> = {
  done: undefined,
  current: undefined,
  pending: undefined,
  skipped: <IconMinus size={16} />,
};

/**
 * 段の列そのもの（枠も見出しも持たない）。手続き状況（ProcedurePanel）と
 * 承認フロー（ApprovalStepper）が同じ見た目になるよう、描画はここ 1 か所。
 *
 * **見た目は段の状態だけで決まる。** Mantine は active との前後で 3 つの
 * 枠（済み / 現在 / 未）を使い分け、現在の枠では `progressIcon`、未の枠では
 * `icon` を読む。どちらにも同じものを渡しておけば、`activeStageIndex` が
 * どこを指していても状態どおりのアイコンが出る。
 */
export function ProcedureStepper({
  stages,
  ...props
}: { stages: ProcedureStage[] } & Omit<
  React.ComponentProps<typeof Stepper>,
  "active" | "children"
>) {
  const isMobile = useIsMobile();
  return (
    <Stepper
      active={activeStageIndex(stages)}
      orientation={isMobile ? "vertical" : "horizontal"}
      size="sm"
      {...props}
    >
      {stages.map((s) => {
        const icon = STATE_ICON[s.state];
        return (
          <Stepper.Step
            color={s.color ?? (GRAY_STATES.has(s.state) ? "gray" : undefined)}
            description={s.description}
            icon={icon}
            key={s.key}
            label={s.label}
            loading={s.state === "current"}
            progressIcon={icon}
          />
        );
      })}
    </Stepper>
  );
}

export function ProcedurePanel({
  title: titleProp,
  stages,
  cancelled = false,
  cancelledNote,
  sourceGroups,
  handoffGroups,
  children,
}: {
  title?: string;
  /** `procedureStages()` で作った段（各段が自分の状態を持つ）。 */
  stages: ProcedureStage[];
  /** キャンセル済み — 段は skipped で描き、バナーを重ねる。 */
  cancelled?: boolean;
  cancelledNote?: string | null;
  /** 前の書類（undefined = セクション非表示）。 */
  sourceGroups?: HandoffGroup[];
  /** 後続書類への受け渡し状況（undefined = セクション非表示）。 */
  handoffGroups?: HandoffGroup[];
  /** 追加コンテンツ（承認記録・操作履歴など）。 */
  children?: React.ReactNode;
}) {
  const tr = useTranslations();
  const title = titleProp ?? tr("ui.procedurePanel.title");
  return (
    <Paper p="md" radius="md" withBorder>
      <Title mb="md" order={5}>
        {title}
      </Title>

      {cancelled && (
        <Alert
          color="red"
          icon={<IconBan size={16} />}
          mb="md"
          title={tr("ui.procedurePanel.cancelled")}
          variant="light"
        >
          {cancelledNote ??
            tr("ui.procedurePanel.thisDocumentHasBeenCancelled")}
        </Alert>
      )}

      {sourceGroups && sourceGroups.length > 0 && (
        <LinkGroups
          groups={sourceGroups}
          heading={tr("ui.procedurePanel.from")}
        />
      )}

      <ProcedureStepper
        mt={sourceGroups && sourceGroups.length > 0 ? "md" : undefined}
        stages={stages}
      />

      {handoffGroups && handoffGroups.length > 0 && (
        <LinkGroups
          groups={handoffGroups}
          heading={tr("ui.procedurePanel.to")}
        />
      )}

      {children}
    </Paper>
  );
}
