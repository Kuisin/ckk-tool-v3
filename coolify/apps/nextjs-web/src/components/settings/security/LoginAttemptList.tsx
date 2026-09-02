"use client";

/**
 * LoginAttemptList — 認証イベントの小さな一覧。
 *
 * SY09 端末詳細の「認証エラー」と SY01 ユーザー詳細の「ログイン履歴」で
 * 共用する。SY0D（ログイン履歴）はフィルタ・サマリ・ドロワーを持つ本体で、
 * こちらは「その端末 / その人の分だけ」を素直に並べる読み取り専用。
 */

import { Badge, Group, Stack, Text } from "@mantine/core";
import { IconShieldLock } from "@tabler/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { loginMethodLabel, loginReasonLabel } from "@/lib/login-attempt-labels";
import type { LoginAttemptRow } from "@/lib/login-attempts";
import { OwnershipBadge } from "./ownership";

export function LoginAttemptList({
  rows,
  emptyMessage,
  showOwnership = true,
}: {
  rows: LoginAttemptRow[];
  emptyMessage?: string;
  showOwnership?: boolean;
}) {
  const tr = useTranslations();
  const locale = useLocale();
  const fmt = useFormat();

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<IconShieldLock size={28} />}
        message={emptyMessage ?? tr("settings.loginAttemptList.noRecords")}
      />
    );
  }

  return (
    <Stack gap="xs">
      {rows.map((r) => (
        <Group
          align="flex-start"
          gap="sm"
          justify="space-between"
          key={r.id}
          wrap="nowrap"
        >
          <div className="min-w-0">
            <Group gap="xs">
              <Badge
                color={r.outcome === "SUCCESS" ? "green" : "red"}
                size="xs"
                variant="light"
              >
                {r.outcome === "SUCCESS"
                  ? tr("settings.security.success")
                  : tr("common.failure")}
              </Badge>
              <Text size="xs">{loginMethodLabel(r.method, locale)}</Text>
              {r.outcome === "FAILURE" && (
                <Text c="dimmed" size="xs">
                  {loginReasonLabel(r.reason, locale)}
                </Text>
              )}
            </Group>
            <Text c="dimmed" size="xs" truncate>
              {r.userName ??
                (r.identifierRef
                  ? tr("settings.loginHistoryView.unresolvedWithRef", {
                      ref: r.identifierRef.slice(0, 8),
                    })
                  : "—")}
              {r.ipAddress ? ` / ${r.ipAddress}` : ""}
            </Text>
          </div>
          <div className="shrink-0 text-right">
            <Text c="dimmed" size="xs">
              {fmt.dateTime(r.createdAt)}
            </Text>
            {showOwnership && (
              <OwnershipBadge source={r.ownershipSource} value={r.ownership} />
            )}
          </div>
        </Group>
      ))}
    </Stack>
  );
}
