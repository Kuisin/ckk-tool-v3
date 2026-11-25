"use client";

/**
 * StepDueDateBadge — 工程納期（work_order_steps.due_date）のバッジ。
 *
 * 過ぎて未完了（COMPLETED / CANCELLED 以外）なら赤、それ以外は灰。判定は
 * lib/step-due-date-core.ts（共有端末と twin）が唯一の定義で、比較は JST の
 * 暦日の文字列同士 — サーバーとブラウザの TZ が違っても結果が揃う。
 */

import { Badge } from "@mantine/core";
import { IconCalendarDue } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  dueDateInstant,
  isStepOverdue,
  jstTodayString,
} from "@/lib/step-due-date-core";

export function StepDueDateBadge({
  dueDate,
  status,
  size = "sm",
}: {
  dueDate: string | null;
  status: string;
  size?: "xs" | "sm";
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  // 「今日」は JST で 1 回だけ決める（描画のたびに時計を読まない）。
  const [today] = useState(() => jstTodayString());
  if (!dueDate) return null;
  const overdue = isStepOverdue(dueDate, status, today);
  return (
    <Badge
      color={overdue ? "red" : "gray"}
      leftSection={<IconCalendarDue size={12} />}
      size={size}
      variant={overdue ? "filled" : "light"}
    >
      {tr("production.stepDueDate.badge", {
        date: fmt.date(dueDateInstant(dueDate)),
      })}
    </Badge>
  );
}
