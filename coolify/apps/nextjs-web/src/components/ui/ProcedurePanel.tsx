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
 *   Stepper      … `stages`+`active` — いまどの段か
 *   次の書類へ   … `handoffGroups`  — どこへ渡ったか（済/未 バッジ付き）
 *
 * 段の組み立ては書類ごとの呼び出し側（純ロジック）が行い、ここは表示のみ。
 * active = 「達成済みの段数」（Mantine Stepper の規約どおり、active 番目の
 * 段が現在進行中として表示される）。
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
import { IconBan } from "@tabler/icons-react";
import Link from "next/link";
import { useTr } from "@/hooks/useTr";
import { useIsMobile } from "@/hooks/useViewport";
import {
  type ApprovalPhase,
  approvalStepDescription,
} from "@/lib/approval-flow";

export interface ProcedureStage {
  key: string;
  label: string;
  /** 補足（日時・承認グループ・差し戻し理由など）。 */
  description?: string | null;
  /** 現在段の色上書き（差し戻し = red など）。 */
  color?: string;
  /** 現在段をスピナー表示（進行中）。 */
  loading?: boolean;
}

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
 * 承認フローの 1 段を ProcedureStage にする（承認を持つ書類の共通形）。
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
  },
): ProcedureStage {
  return {
    key: "approval",
    label: opts.label ?? "承認",
    description: opts.approvedAt
      ? opts.fmtDate(opts.approvedAt)
      : approvalStepDescription(approval),
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
  const tr = useTr();
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
                      {it.done ? "済" : tr("未")}
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

export function ProcedurePanel({
  title = "手続き状況",
  stages,
  active,
  cancelled = false,
  cancelledNote,
  sourceGroups,
  handoffGroups,
  children,
}: {
  title?: string;
  stages: ProcedureStage[];
  /** 達成済みの段数（= 現在進行中の段の index）。 */
  active: number;
  /** キャンセル済み — Stepper は現状のまま、バナーを重ねる。 */
  cancelled?: boolean;
  cancelledNote?: string | null;
  /** 前の書類（undefined = セクション非表示）。 */
  sourceGroups?: HandoffGroup[];
  /** 後続書類への受け渡し状況（undefined = セクション非表示）。 */
  handoffGroups?: HandoffGroup[];
  /** 追加コンテンツ（承認記録・操作履歴など）。 */
  children?: React.ReactNode;
}) {
  const tr = useTr();
  const isMobile = useIsMobile();
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
          title={tr("キャンセル済み")}
          variant="light"
        >
          {cancelledNote ?? tr("この書類はキャンセルされています。")}
        </Alert>
      )}

      {sourceGroups && sourceGroups.length > 0 && (
        <LinkGroups groups={sourceGroups} heading={tr("前の書類から")} />
      )}

      <Stepper
        active={active}
        mt={sourceGroups && sourceGroups.length > 0 ? "md" : undefined}
        orientation={isMobile ? "vertical" : "horizontal"}
        size="sm"
      >
        {stages.map((s, i) => (
          <Stepper.Step
            color={i === active ? s.color : undefined}
            description={s.description}
            key={s.key}
            label={s.label}
            loading={i === active && s.loading}
          />
        ))}
      </Stepper>

      {handoffGroups && handoffGroups.length > 0 && (
        <LinkGroups groups={handoffGroups} heading={tr("次の書類へ")} />
      )}

      {children}
    </Paper>
  );
}
