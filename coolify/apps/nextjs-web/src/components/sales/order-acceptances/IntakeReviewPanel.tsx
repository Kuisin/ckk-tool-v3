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
import { useTranslations } from "next-intl";
import { useState } from "react";
import { GhostButton } from "@/components/ui/buttons";
import type { FieldReview } from "@/lib/intake-review";

export function IntakeReviewPanel({ review }: { review: FieldReview[] }) {
  const tr = useTranslations();
  const STATUS_BADGE: Record<string, { label: string; color: string }> = {
    unmatched: {
      label: tr("sales.intakeReviewPanel.notInTheMaster"),
      color: "orange",
    },
    missing: {
      label: tr("sales.intakeReviewPanel.couldNotBeRead"),
      color: "gray",
    },
  };
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
        title={tr("sales.orderAcceptances.everyFieldWasIdentified")}
        variant="light"
      >
        <Text size="sm">
          {tr("sales.orderAcceptances.whatWasReadMatchesTheMaster")}
        </Text>
      </Alert>
    );
  }

  return (
    <Alert
      color="orange"
      icon={<IconAlertTriangle size={16} />}
      title={tr("sales.intakeReviewPanel.itemsNeedingConfirmation", {
        count: unresolved.length,
      })}
      variant="light"
    >
      <Stack gap="xs">
        <Group gap="xs" justify="space-between" wrap="nowrap">
          <Text className="min-w-0" size="sm">
            {tr("sales.orderAcceptances.someFieldsCouldNotBeSettled")}
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
            {open
              ? tr("sales.intakeReviewPanel.hideTheBreakdown")
              : tr("sales.orderAcceptances.viewTheBreakdown")}
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
                            {tr("sales.intakeReviewPanel.readAsValue", {
                              value: r.read,
                            })}
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
