"use client";

/**
 * PrivilegedApprovalsList — 未処理一覧 (CM01) の「特権アクセス」タブ。
 *
 * 自分が決裁できる特権アクセスの申請（承認依頼中）を並べるだけで、**決裁は
 * しない** — 承認は SY0G（/settings/privileged-access）へ送る。方式 A の
 * 部分許可も方式 B の適用も、承認モーダルを 2 か所に置くと片方だけ直る事故に
 * なるため、操作の口は 1 つに保つ。
 *
 * カードは SY0G と同じ PrivilegedRequestCard を使う（申請の見え方が画面で
 * 変わらない）。
 */

import { Paper, Stack, Text } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { PrivilegedRequestCard } from "@/components/settings/privileged/PrivilegedRequestCard";
import { SecondaryButton } from "@/components/ui/buttons";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PrivilegedRequestRow } from "@/lib/privileged-requests";

const PRIVILEGED_ACCESS_PATH = "/settings/privileged-access";

export function PrivilegedApprovalsList({
  rows,
}: {
  rows: PrivilegedRequestRow[];
}) {
  const tr = useTranslations();

  if (rows.length === 0) {
    return (
      <Paper p="md" radius="md" withBorder>
        <EmptyState
          icon={<IconShieldCheck size={28} />}
          message={tr("settings.privileged.thereAreNoRequestsAwaitingA")}
        />
      </Paper>
    );
  }

  return (
    <Stack gap="xs">
      <Text c="dimmed" size="xs">
        {tr("general.tasksView.privilegedDecidedInSy0g")}
      </Text>
      {rows.map((row) => (
        <PrivilegedRequestCard
          actions={
            <SecondaryButton href={PRIVILEGED_ACCESS_PATH}>
              {tr("general.tasksView.decide")}
            </SecondaryButton>
          }
          key={row.id}
          row={row}
        />
      ))}
    </Stack>
  );
}
