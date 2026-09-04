"use client";

/**
 * ホームの「進行中の注文 N 件」と段ごとの内訳。
 *
 * 段は 0 件でも出す —— 「製造中が 0」も情報で、抜けていると段が飛んだのか
 * 元から無いのかが読めない。ただし**キャンセルは 0 件なら出さない**
 * （進行の外なので、無いときに枠だけ残す意味がない）。
 */

import { Card, Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { PORTAL_PROGRESS_COLOR } from "@/components/portal/PortalProgress";
import {
  PORTAL_PROGRESS_STEPS,
  type PortalProgress,
  portalProgressLabel,
} from "@/lib/portal-progress-core";

export function PortalProgressCounts({
  active,
  byProgress,
}: {
  active: number;
  byProgress: Record<PortalProgress, number>;
}) {
  const tr = useTranslations();
  const steps: PortalProgress[] = [
    ...PORTAL_PROGRESS_STEPS,
    ...(byProgress.CANCELLED > 0 ? (["CANCELLED"] as const) : []),
  ];

  return (
    <Card padding="lg" radius="md" withBorder>
      <Stack gap="sm">
        <Group align="baseline" gap="xs">
          <Text c="dimmed" size="sm">
            {tr("portal.home.activeOrders")}
          </Text>
          <Text
            fw={700}
            size="xl"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {active}
          </Text>
        </Group>
        <Group gap="lg" wrap="wrap">
          {steps.map((step) => (
            <Stack gap={0} key={step}>
              <Text
                c={`${PORTAL_PROGRESS_COLOR[step]}.7`}
                fw={600}
                size="lg"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {byProgress[step]}
              </Text>
              <Text c="dimmed" size="xs">
                {portalProgressLabel(step, tr)}
              </Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Card>
  );
}
