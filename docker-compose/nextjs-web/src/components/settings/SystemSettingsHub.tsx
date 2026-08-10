"use client";

/**
 * SystemSettingsHub — landing page for the システム設定 app (`/settings`).
 *
 * アプリ設定（per-app configurable logic, driven by SETTINGS_APPS）のカード一覧。
 * かつての「システム管理」リンク集は廃止 — アプリ管理（SY05）・ファイル管理
 * （SY06）・操作履歴（SY07）は独立アプリ、通知設定は /profile/notifications。
 */

import { Card, Group, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { type AppIcon, resolveAppIcon } from "@/lib/icons";
import { SETTINGS_APPS } from "@/lib/settings-apps";
import classes from "./SystemSettingsHub.module.css";

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
  );
}
