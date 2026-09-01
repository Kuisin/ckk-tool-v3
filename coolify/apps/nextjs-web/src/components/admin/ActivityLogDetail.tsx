"use client";

/**
 * ActivityLogDetail — 操作履歴 (SY07) 詳細。
 *
 * 1 件の audit_logs を表示: 日時・操作・対象・レコード・ユーザー・変更要約に
 * 加え、関連ドキュメント/アプリへのジャンプ（lib/audit-links）と
 * 変更前後の生データ（before/after JSON）。ユーザーはユーザー管理 (SY01) の
 * 詳細ページへリンクする。
 */

import { Anchor, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconExternalLink, IconUser } from "@tabler/icons-react";
import Link from "next/link";
import { AuditChangeTable } from "@/components/ui/AuditChangeTable";
import { SecondaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import type { ActivityDetailEntry } from "@/lib/audit";
import { auditRecordLink } from "@/lib/audit-links";

const BASE_PATH = "/settings/activity";

export function ActivityLogDetail({ entry }: { entry: ActivityDetailEntry }) {
  const tr = useTr();
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
              ? tr("{appLabel}を開く", { appLabel: tr(link.appLabel) })
              : tr("{appLabel}で表示", { appLabel: tr(link.appLabel) })}
          </SecondaryButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("システム"),
        { label: tr("操作履歴"), href: BASE_PATH },
        `#${entry.id}`,
      ]}
      status={<Badge variant="light">{entry.action}</Badge>}
      title={tr("操作履歴 #{id}", { id: entry.id })}
    >
      <SummaryGrid>
        <FieldValue label={tr("日時")} value={entry.at} />
        <FieldValue
          label={tr("操作")}
          value={`${entry.action}（${entry.actionRaw}）`}
        />
        <FieldValue label={tr("対象")} value={entry.tableLabel} />
        <FieldValue
          label={tr("レコード")}
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
          label={tr("ユーザー")}
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
          label={tr("関連ページ")}
          value={
            link ? (
              <Anchor component={Link} href={link.href} size="sm">
                {tr(link.appLabel)}
                {link.kind === "list" && tr("（一覧で表示）")}
              </Anchor>
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <Paper p="md" radius="md" withBorder>
        <Text c="dimmed" fw={600} mb="xs" size="xs">
          {tr("変更内容（要約）")}
        </Text>
        <Text size="sm">{entry.detail}</Text>
      </Paper>

      <Stack gap="md">
        {/* 何が変わったかを**列名と値で**出す。生の JSON だけだと、
            読む人が JSON を解読する作業になっていた。元データは
            この中の「生データを表示」で見られる。 */}
        <Paper p="md" radius="md" withBorder>
          <Text c="dimmed" fw={600} mb="xs" size="xs">
            {tr("変更内容")}
          </Text>
          <AuditChangeTable
            action={entry.action}
            after={entry.afterData}
            before={entry.beforeData}
            tableName={entry.tableName}
          />
        </Paper>
      </Stack>
    </DetailShell>
  );
}
