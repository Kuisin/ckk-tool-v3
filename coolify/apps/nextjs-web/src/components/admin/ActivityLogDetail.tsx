"use client";

/**
 * ActivityLogDetail — 操作履歴 (SY07) 詳細。
 *
 * リードに「誰が・何を・どうした」の 1 文（entry.summary）を出し、
 * その下の SummaryGrid で日時・操作・対象・レコード・ユーザーを個別に見せる。
 * 変更点は列名と値の表（AuditChangeTable）で、生データ（before/after JSON）は
 * その中の折りたたみで見られる。関連ドキュメント/アプリへのジャンプは
 * lib/audit-links、ユーザーはユーザー管理 (SY01) の詳細ページへリンクする。
 */

import { Anchor, Badge, Group, Paper, Stack, Text } from "@mantine/core";
import { IconExternalLink, IconUser } from "@tabler/icons-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AuditChangeTable } from "@/components/ui/AuditChangeTable";
import { SecondaryButton } from "@/components/ui/buttons";
import { FieldValue } from "@/components/ui/FieldValue";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import type { ActivityDetailEntry } from "@/lib/audit";
import { auditRecordLink } from "@/lib/audit-links";
import type { Locale } from "@/lib/i18n";

const BASE_PATH = "/settings/activity";

export function ActivityLogDetail({ entry }: { entry: ActivityDetailEntry }) {
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const link = auditRecordLink(entry.tableName, entry.recordId, locale);

  return (
    <DetailShell
      actions={
        link ? (
          <SecondaryButton
            href={link.href}
            leftSection={<IconExternalLink size={14} />}
          >
            {link.kind === "detail"
              ? tr("admin.activityLogDetail.openApplabel", {
                  appLabel: link.appLabel,
                })
              : tr("admin.activityLogDetail.viewInApplabel", {
                  appLabel: link.appLabel,
                })}
          </SecondaryButton>
        ) : undefined
      }
      breadcrumbs={[
        tr("common.system"),
        { label: tr("common.activityLog"), href: BASE_PATH },
        `#${entry.id}`,
      ]}
      status={<Badge variant="light">{entry.action}</Badge>}
      title={tr("admin.activityLogDetail.activityId", { id: entry.id })}
    >
      {/* 「誰が・何を・どうした」の 1 文をリードに出す。SummaryGrid の各項目は
          この文の裏付け（日時・対象・レコード…）を個別に見るためのもの。 */}
      <Text size="lg">{entry.summary}</Text>

      <SummaryGrid>
        <FieldValue label={tr("common.dateAndTime")} value={entry.at} />
        <FieldValue
          label={tr("common.actions")}
          value={tr("admin.activityLogDetail.actionWithRaw", {
            label: entry.action,
            raw: entry.actionRaw,
          })}
        />
        <FieldValue label={tr("common.target")} value={entry.tableLabel} />
        <FieldValue
          label={tr("common.record")}
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
          label={tr("common.user")}
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
          label={tr("admin.activityLogDetail.relatedPages")}
          value={
            link ? (
              <Anchor component={Link} href={link.href} size="sm">
                {link.appLabel}
                {link.kind === "list" &&
                  tr("admin.activityLogDetail.shownInTheList")}
              </Anchor>
            ) : (
              "—"
            )
          }
        />
      </SummaryGrid>

      <Stack gap="md">
        {/* 何が変わったかを**列名と値で**出す。生の JSON だけだと、
            読む人が JSON を解読する作業になっていた。元データは
            この中の「生データを表示」で見られる。 */}
        <Paper p="md" radius="md" withBorder>
          <Text c="dimmed" fw={600} mb="xs" size="xs">
            {tr("common.whatChanges")}
          </Text>
          <AuditChangeTable
            actionRaw={entry.actionRaw}
            after={entry.afterData}
            before={entry.beforeData}
            tableName={entry.tableName}
          />
        </Paper>
      </Stack>
    </DetailShell>
  );
}
