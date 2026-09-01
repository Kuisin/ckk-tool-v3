"use client";

/**
 * PrivilegedRequestCard — 申請 1 件の表示。自分の申請にも承認一覧にも同じ形で出す。
 *
 * 承認者と申請者では見たいものが違う（承認者は「何が起きるか」、申請者は
 * 「あと何分使えるか」）が、カードを分けると片方だけ直る事故が起きるので、
 * 出す情報は同じにして操作だけ差し替える。
 */

import { Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  GRANT_STATE_COLOR,
  GRANT_STATE_LABEL,
} from "@/lib/privileged-access-core";
import type { PrivilegedRequestRow } from "@/lib/privileged-requests";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "承認依頼中",
  APPROVED: "承認済み",
  REJECTED: "差し戻し",
  CANCELLED: "取り下げ",
  REVOKED: "取り消し",
  EXPIRED: "期限切れ",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "yellow",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  REVOKED: "red",
  EXPIRED: "gray",
};

/** 残り時間を「12 分 30 秒」の形に。1 秒ごとに動かすのは利用中のときだけ。 */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} 時間 ${m} 分`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

/**
 * 残りのカウントダウン。サーバーが返した残りミリ秒を起点に、クライアントで
 * 減らしていく（毎秒サーバーへ問い合わせない）。ずれても意味は変わらない —
 * 実際に使えるかどうかは操作した瞬間にサーバーが判定するため、ここは目安。
 */
function Countdown({ initialMs }: { initialMs: number }) {
  const tr = useTranslations();
  const [ms, setMs] = useState(initialMs);
  useEffect(() => {
    setMs(initialMs);
    if (initialMs <= 0) return;
    const t = setInterval(() => {
      setMs((v) => Math.max(0, v - 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [initialMs]);
  if (ms <= 0) return <Badge color="gray">{tr("common.expired")}</Badge>;
  return (
    <Badge color="violet" variant="filled">
      残り {formatRemaining(ms)}
    </Badge>
  );
}

export function PrivilegedRequestCard({
  row,
  actions,
}: {
  row: PrivilegedRequestRow;
  /** この行に対する操作（承認 / 差し戻し / 取り下げ …）。無ければ表示のみ。 */
  actions?: React.ReactNode;
}) {
  const tr = useTranslations();
  const fmt = useFormat();
  // 方式 A で「利用中」のときだけ実時間のカウントダウンを出す。承認依頼中や
  // 期限切れに秒を出しても読む意味が無い。
  // **未使用（ARMED）ではカウントダウンしない。** あの残り時間は窓の終わりまで
  // なので、1 回あたりの持ち時間と取り違えられる。時計が動いてから出す。
  const live =
    row.kind === "elevation" &&
    row.state === "ACTIVE" &&
    row.remainingMs != null &&
    row.remainingMs > 0;

  return (
    <Paper p="md" radius="md" withBorder>
      <Group align="flex-start" justify="space-between" wrap="nowrap">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600} size="sm">
              {row.title}
            </Text>
            <Badge color={STATUS_COLOR[row.status] ?? "gray"} variant="light">
              {STATUS_LABEL[row.status] ?? row.status}
            </Badge>
            {row.state && row.status === "APPROVED" && (
              <Badge color={GRANT_STATE_COLOR[row.state]} variant="light">
                {GRANT_STATE_LABEL[row.state]}
              </Badge>
            )}
            {live && row.remainingMs != null && (
              <Countdown initialMs={row.remainingMs} />
            )}
          </Group>

          <Text c="dimmed" size="xs">
            {row.detail}
          </Text>

          {/* 承認済みで一部だけ許可されたときは、外された操作も見せる。
              「申請したのに使えない」を無言にしないため。 */}
          {row.status === "APPROVED" &&
            row.operations.some((o) => !o.granted) && (
              <Text c="orange" size="xs">
                許可されなかった操作:{" "}
                {row.operations
                  .filter((o) => !o.granted)
                  .map((o) => o.label)
                  .join(" / ")}
              </Text>
            )}

          <Text size="xs">理由: {row.reason}</Text>

          {row.kind === "elevation" && row.windowEndsAt && (
            <Text c="dimmed" size="xs">
              利用できる期間: {fmt.dateTime(row.windowStartsAt)} 〜{" "}
              {fmt.dateTime(row.windowEndsAt)} / 1 回 {row.durationMinutes} 分
              {row.activatedAt
                ? `（${fmt.dateTime(row.activatedAt)} に開始・${row.useCount} 回使用）`
                : tr("settings.privileged.unusedMeasuredFromTheFirstUse")}
            </Text>
          )}

          <Text c="dimmed" size="xs">
            申請: {row.requestedByName} / {fmt.dateTime(row.requestedAt)}
            {row.decidedByName &&
              ` ・ 決裁: ${row.decidedByName} / ${fmt.dateTime(row.decidedAt)}`}
          </Text>

          {row.decisionComment && (
            <Text c="dimmed" size="xs">
              決裁コメント: {row.decisionComment}
            </Text>
          )}

          {/* 承認されたのに当てられなかったケース。差し戻しとは別の事実なので
              別の色で出す。 */}
          {row.applyError && (
            <Text c="red" size="xs">
              適用できませんでした: {row.applyError}
            </Text>
          )}
          {row.appliedAt && (
            <Text c="green" size="xs">
              {fmt.dateTime(row.appliedAt)} に適用しました
            </Text>
          )}
        </Stack>

        {actions && (
          <Group gap="xs" wrap="nowrap">
            {actions}
          </Group>
        )}
      </Group>
    </Paper>
  );
}
