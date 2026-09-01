"use client";

/**
 * IntakeReviewPanel — 項目ごとの突合結果（人が直すものだけ）。
 *
 * AI が **何を読み取ったか** と **なぜ確定できないか** を項目単位で出す。
 * 「未特定」だけだと、読めなかったのか／読めたが未登録なのかが分からず、
 * 対処（書類を見て入力 or マスタ登録）を選べないため。
 *
 * 判定は lib/intake-review（純ロジック・テスト付き）。ここは表示のみ。
 *
 * 内訳は**既定で畳む**。項目が多いと注意書きだけで画面が埋まり、直す対象の
 * フォーム（顧客・明細）が下へ押し出されてしまうため。件数は見出しに残すので、
 * 畳んでいても「何件あるか」は分かる。
 */

import {
  Alert,
  Badge,
  Collapse,
  Group,
  List,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheck,
} from "@tabler/icons-react";
import { useState } from "react";
import { GhostButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import type { FieldReview } from "@/lib/intake-review";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  unmatched: { label: "マスタに無い", color: "orange" },
  missing: { label: "読み取れず", color: "gray" },
};

export function IntakeReviewPanel({ review }: { review: FieldReview[] }) {
  const tr = useTr();
  // 既定は畳む。開くと以後はそのページに居る間だけ開いたまま。
  const [open, setOpen] = useState(false);

  const unresolved = review.filter(
    (r) => r.status === "unmatched" || r.status === "missing",
  );

  // 手入力（抽出なし）は何も出さない。
  if (review.length === 0) return null;

  if (unresolved.length === 0) {
    return (
      <Alert
        color="green"
        icon={<IconCircleCheck size={16} />}
        title={tr("全項目を特定できました")}
        variant="light"
      >
        <Text size="sm">
          {tr(
            tr(
              tr(
                "読み取った内容がマスタと一致しています。書類と見比べて確認してください。",
              ),
            ),
          )}
        </Text>
      </Alert>
    );
  }

  return (
    <Alert
      color="orange"
      icon={<IconAlertTriangle size={16} />}
      title={`確認が必要な項目 ${unresolved.length} 件`}
      variant="light"
    >
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text className="min-w-0" size="sm">
            {tr(
              tr(
                tr(
                  "自動で確定できなかった項目があります。書類を見ながら直してください。",
                ),
              ),
            )}
          </Text>
          <GhostButton
            aria-expanded={open}
            className="shrink-0"
            color="orange"
            onClick={() => setOpen((o) => !o)}
            rightSection={
              open ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />
            }
          >
            {open ? "内訳を隠す" : tr("内訳を見る")}
          </GhostButton>
        </Group>
        <Collapse expanded={open}>
          <List listStyleType="none" spacing={6}>
            {unresolved.map((r) => {
              const badge = STATUS_BADGE[r.status];
              return (
                <List.Item key={r.key}>
                  <Group align="flex-start" gap={6} wrap="nowrap">
                    {badge && (
                      <Badge
                        className="shrink-0"
                        color={badge.color}
                        size="xs"
                        variant="light"
                      >
                        {badge.label}
                      </Badge>
                    )}
                    <Stack className="min-w-0" gap={0}>
                      <Text fw={600} size="sm">
                        {r.label}
                        {r.read ? (
                          <Text c="dimmed" component="span" size="sm">
                            {" "}
                            — 読み取り「{r.read}」
                          </Text>
                        ) : null}
                      </Text>
                      {r.hint && (
                        <Text c="dimmed" size="xs">
                          {r.hint}
                        </Text>
                      )}
                    </Stack>
                  </Group>
                </List.Item>
              );
            })}
          </List>
        </Collapse>
      </Stack>
    </Alert>
  );
}
