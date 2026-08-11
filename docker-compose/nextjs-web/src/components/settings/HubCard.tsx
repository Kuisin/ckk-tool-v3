"use client";

/**
 * HubCard — 設定系ページで使う「アイコン + 説明 + ホバー」のリンクカード。
 * 例: 試算計算（SY02）のハブセクション。
 */

import { Card, Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import type { AppIcon } from "@/lib/icons";
import classes from "./HubCard.module.css";

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
