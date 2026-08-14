"use client";

/**
 * ActivityLogDetail — 操作履歴 (SY07) 詳細。
 *
 * 1 件の audit_logs を表示: 日時・操作・対象・レコード・ユーザー・変更要約に
 * 加え、関連ドキュメント/アプリへのジャンプ（lib/audit-links）と
 * 変更前後の生データ（before/after JSON）。ユーザーはユーザー管理 (SY01) の
 * 詳細ページへリンクする。
 */

import { Anchor, Badge, Code, Group, Paper, Stack, Text } from "@mantine/core";
import { IconExternalLink, IconUser } from "@tabler/icons-react";
import Link from "next/link";
import { SecondaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import type { ActivityDetailEntry } from "@/lib/audit";
import { auditRecordLink } from "@/lib/audit-links";

const BASE_PATH = "/settings/activity";

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <Paper p="md" radius="md" withBorder>
      <Text c="dimmed" fw={600} mb="xs" size="xs">
        {title}
      </Text>
      {value == null ? (
        <Text c="dimmed" size="sm">
          なし
        </Text>
      ) : (
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(value, null, 2)}
        </Code>
      )}
    </Paper>
  );
}

export function ActivityLogDetail({ entry }: { entry: ActivityDetailEntry }) {
  const link = auditRecordLink(entry.tableName, entry.recordId);

  return (
    <DetailShell
      actions={
        link ? (
          <SecondaryButton
            href={link.href}
            leftSection={<IconExternalLink size={14} />}
          >
            {link.kind === "detail"
              ? `${link.appLabel}を開く`
              : `${link.appLabel}で表示`}
          </SecondaryButton>
        ) : undefined
      }
      breadcrumbs={[
        "システム",
        { label: "操作履歴", href: BASE_PATH },
        `#${entry.id}`,
      ]}
      status={<Badge variant="light">{entry.action}</Badge>}
      title={`操作履歴 #${entry.id}`}
    >
      <SummaryGrid>
        <FieldValue label="日時" value={entry.at} />
        <FieldValue
          label="操作"
          value={`${entry.action}（${entry.actionRaw}）`}
        />
        <FieldValue label="対象" value={entry.tableLabel} />
        <FieldValue
          label="レコード"
          value={
            entry.recordId ? (
              <Text ff="mono" size="sm">
                {entry.recordId}
              </Text>
            ) : (
              "—"
            )
          }
        />
        <FieldValue
          label="ユーザー"
          value={
            entry.userId ? (
              <Anchor
                component={Link}
                href={`/settings/users/${entry.userId}`}
                size="sm"
              >
                <Group component="span" gap={4} wrap="nowrap">
                  <IconUser size={14} />
                  {entry.user}
                </Group>
              </Anchor>
            ) : (
              entry.user
            )
          }
        />
        <FieldValue
          label="関連ページ"
          value={
            link ? (
              <Anchor component={Link} href={link.href} size="sm">
                {link.appLabel}
                {link.kind === "list" && "（一覧で表示）"}
              </Anchor>
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Text c="dimmed" fw={600} mb="xs" size="xs">
          変更内容（要約）
        </Text>
        <Text size="sm">{entry.detail}</Text>
      </Paper>

      <Stack gap="md">
        <JsonBlock title="変更前（before）" value={entry.beforeData} />
        <JsonBlock title="変更後（after）" value={entry.afterData} />
      </Stack>
    </DetailShell>
  );
}
