"use client";

/**
 * ActionCard — 書類の「いま何をすべきか」を最上部に出すカード。
 *
 * 承認フロー（承認依頼 → 承認 → 発注 / 注文確定 …）のアクションは、以前は
 * Stepper の下にボタンとして置かれていて見落とされやすかった。1 画面につき
 * 1 枚このカードをヘッダー直下に出し、状態と操作を同じ場所にまとめる。
 *
 * 色は「ログイン中のユーザーがその操作をできるか」で決まる（tone）:
 *   action  (blue)  — 自分で先へ進められる操作（承認依頼・注文確定・発注 …）
 *   approve (green) — 承認権限がある。承認 / 差し戻しできる
 *   wait    (gray)  — 権限が無いので待つだけ（「承認依頼中」表示）
 *   alert   (red)   — 差し戻しなど、対応が必要な状態
 *
 * アクションが無い状態（wait / alert）は `actions` を省略してよい。
 */

import { Group, Paper, Stack, Text, ThemeIcon } from "@mantine/core";
import type { ReactNode } from "react";
import { useIsMobile } from "@/hooks/useViewport";

export type ActionCardTone = "action" | "approve" | "wait" | "alert";

const TONE_COLOR: Record<ActionCardTone, string> = {
  action: "blue",
  approve: "green",
  wait: "gray",
  alert: "red",
};

export function ActionCard({
  tone,
  icon,
  title,
  description,
  actions,
}: {
  tone: ActionCardTone;
  icon: ReactNode;
  /** 状態の見出し（例: 「承認依頼中」「承認してください」）。 */
  title: string;
  /** 補足（誰が何をするか・未保存の注意など）。 */
  description?: ReactNode;
  /** 操作ボタン。無ければ状態表示だけのカードになる。 */
  actions?: ReactNode;
}) {
  const isMobile = useIsMobile();
  const color = TONE_COLOR[tone];
  return (
    <Paper
      p="md"
      radius="md"
      style={{
        borderLeft: `4px solid var(--mantine-color-${color}-filled)`,
        backgroundColor: `var(--mantine-color-${color}-light)`,
      }}
      withBorder
    >
      <Group
        align={isMobile ? "flex-start" : "center"}
        gap="md"
        justify="space-between"
        wrap={isMobile ? "wrap" : "nowrap"}
      >
        <Group align="flex-start" gap="sm" wrap="nowrap">
          <ThemeIcon color={color} radius="md" size="lg" variant="light">
            {icon}
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={600} size="sm">
              {title}
            </Text>
            {description && (
              <Text c="dimmed" size="xs">
                {description}
              </Text>
            )}
          </Stack>
        </Group>
        {actions && (
          <Group
            className={isMobile ? undefined : "shrink-0"}
            gap="xs"
            w={isMobile ? "100%" : undefined}
          >
            {actions}
          </Group>
        )}
      </Group>
    </Paper>
  );
}
