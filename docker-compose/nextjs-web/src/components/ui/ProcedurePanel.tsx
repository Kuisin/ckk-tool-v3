"use client";

/**
 * ProcedurePanel — 書類の手続き状況（作成 → … → 完了）の共通パネル。
 *
 * 従来の承認状況（承認段だけの Stepper）を全ライフサイクルへ広げたもの。
 * Stepper で「今どの段か」を出し、下の「次の書類へ」セクションで
 * **後続書類へ渡ったか**（指示書→出荷書、注文明細→指示書/出荷書、
 * 出荷書→納品書 など）を件数・リンク付きで追跡する。
 *
 * 段の組み立ては書類ごとの呼び出し側（純ロジック）が行い、ここは表示のみ。
 * active = 「達成済みの段数」（Mantine Stepper の規約どおり、active 番目の
 * 段が現在進行中として表示される）。
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
import { useIsMobile } from "@/hooks/useViewport";

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
  /** 後続へ渡り切ったか（済/未 バッジ）。 */
  done: boolean;
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

export function ProcedurePanel({
  title = "手続き状況",
  stages,
  active,
  cancelled = false,
  cancelledNote,
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
  /** 後続書類への受け渡し状況（undefined = セクション非表示）。 */
  handoffGroups?: HandoffGroup[];
  /** 追加コンテンツ（承認記録・操作履歴など）。 */
  children?: React.ReactNode;
}) {
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
          title="キャンセル済み"
          variant="light"
        >
          {cancelledNote ?? "この書類はキャンセルされています。"}
        </Alert>
      )}

      <Stepper
        active={active}
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
        <Stack gap="sm" mt="md">
          <Text c="dimmed" fw={600} size="sm">
            次の書類へ
          </Text>
          {handoffGroups.map((g) => (
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
                      <Badge
                        color={it.done ? "green" : "gray"}
                        size="sm"
                        variant="light"
                      >
                        {it.done ? "済" : "未"}
                      </Badge>
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
      )}

      {children}
    </Paper>
  );
}
