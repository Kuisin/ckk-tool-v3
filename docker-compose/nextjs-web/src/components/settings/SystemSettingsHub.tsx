"use client";

/**
 * SystemSettingsHub — landing page for the システム設定 app (`/settings`).
 *
 * Two sections:
 *  - アプリ設定 — per-app configurable logic (driven by SETTINGS_APPS). Each card
 *    links to that app's settings page. 試算 is the first.
 *  - システム管理 — links to the existing admin surfaces (app on/off, 通知, files,
 *    audit log).
 */

import {
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from "@mantine/core";
import {
  IconBell,
  IconChevronRight,
  IconFolder,
  IconHistory,
  IconLayoutGrid,
} from "@tabler/icons-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { type AppIcon, resolveAppIcon } from "@/lib/icons";
import { SETTINGS_APPS } from "@/lib/settings-apps";
import classes from "./SystemSettingsHub.module.css";

interface AdminLink {
  label: string;
  description: string;
  href: string;
  icon: AppIcon;
}

const ADMIN_LINKS: AdminLink[] = [
  {
    label: "アプリ表示",
    description:
      "環境別にアプリの表示 ON/OFF を切り替え（未リリース機能の隠蔽）。",
    href: "/admin/apps",
    icon: IconLayoutGrid,
  },
  {
    label: "通知設定",
    description: "自分宛ての通知チャネル（アプリ内・メール・プッシュ）。",
    href: "/settings/notifications",
    icon: IconBell,
  },
  {
    label: "ファイル管理",
    description: "アップロード済みファイル（SeaweedFS）の一覧・削除。",
    href: "/admin/files",
    icon: IconFolder,
  },
  {
    label: "操作履歴",
    description: "監査ログ（作成・更新・削除の before/after）。",
    href: "/admin/activity",
    icon: IconHistory,
  },
];

export function HubCard({
  href,
  icon: Icon,
  label,
  description,
  color,
}: {
  href: string;
  icon: AppIcon;
  label: string;
  description: string;
  color: string;
}) {
  return (
    <Card
      className={classes.card}
      component={Link}
      href={href}
      padding="md"
      radius="md"
      withBorder
    >
      <Group align="flex-start" gap="sm" wrap="nowrap">
        <ThemeIcon color={color} radius="md" size={40} variant="light">
          <Icon size={22} />
        </ThemeIcon>
        <Stack className="min-w-0" gap={2} style={{ flex: 1 }}>
          <Text fw={600} size="sm">
            {label}
          </Text>
          <Text c="dimmed" size="xs">
            {description}
          </Text>
        </Stack>
        <IconChevronRight className={classes.chevron} size={16} stroke={1.5} />
      </Group>
    </Card>
  );
}

export function SystemSettingsHub() {
  return (
    <Stack gap="xl" maw={1000}>
      <PageHeader breadcrumbs={["システム"]} title="システム設定" />

      <Stack gap="sm">
        <Title c="dimmed" order={5}>
          アプリ設定
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {SETTINGS_APPS.map((app) => (
            <HubCard
              color="blue"
              description={app.description}
              href={app.href}
              icon={resolveAppIcon(app.icon)}
              key={app.key}
              label={app.label}
            />
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap="sm">
        <Title c="dimmed" order={5}>
          システム管理
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {ADMIN_LINKS.map((link) => (
            <HubCard
              color="gray"
              description={link.description}
              href={link.href}
              icon={link.icon}
              key={link.href}
              label={link.label}
            />
          ))}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
