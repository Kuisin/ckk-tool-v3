"use client";

/**
 * OrderAcceptanceHub — 受注請書 landing. Entry points for the AI-first intake
 * (PDF/scan → extraction) and manual entry. A document list is intentionally
 * omitted (DB persistence is out of scope for this iteration).
 */

import { Paper, SimpleGrid, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconPencilPlus, IconRobot } from "@tabler/icons-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

const BASE_PATH = "/sales/order-acceptances";

function ActionCard({
  href,
  icon,
  title,
  desc,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Paper
      component={Link}
      href={href}
      p="lg"
      radius="md"
      shadow="xs"
      style={{ textDecoration: "none", color: "inherit" }}
      withBorder
    >
      <Stack gap="sm">
        <ThemeIcon color={color} radius="md" size={48} variant="light">
          {icon}
        </ThemeIcon>
        <Text fw={600}>{title}</Text>
        <Text c="dimmed" size="sm">
          {desc}
        </Text>
      </Stack>
    </Paper>
  );
}

export function OrderAcceptanceHub() {
  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={["販売", "受注請書"]} title="受注請書" />
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <ActionCard
          color="blue"
          desc="お客様の注文書PDF・スキャンを取り込み、AIが内容を自動入力します。内容を確認するだけ。"
          href={`${BASE_PATH}/intake`}
          icon={<IconRobot size={26} />}
          title="PDFから取込（AI）"
        />
        <ActionCard
          color="gray"
          desc="ファイルがない場合や読取に失敗した場合に、すべての項目を手入力します。"
          href={`${BASE_PATH}/intake?manual=1`}
          icon={<IconPencilPlus size={26} />}
          title="手動で入力"
        />
      </SimpleGrid>
    </Stack>
  );
}
