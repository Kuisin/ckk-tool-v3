"use client";

/**
 * TrialPricingHubSections — 試算計算（SY02）ハブのセクションカード一覧。
 *
 * SY01 システム設定ハブと同じ HubCard（アイコン + 説明 + ホバー）で統一する。
 * アイコンはクライアント側で解決するため、サーバーページからは section key
 * （文字列）だけを受け取る。
 */

import { SimpleGrid } from "@mantine/core";
import {
  IconCoin,
  IconForms,
  IconMathFunction,
  IconTable,
  IconTool,
} from "@tabler/icons-react";
import { HubCard } from "@/components/settings/HubCard";
import type { AppIcon } from "@/lib/icons";

const SECTION_ICONS: Record<string, AppIcon> = {
  criteria: IconMathFunction,
  "tool-types": IconTool,
  "material-policy": IconCoin,
  "custom-inputs": IconForms,
  lookups: IconTable,
};

export type TrialPricingHubSection = {
  /** SECTION_ICONS のキー（= サブページのパスセグメント）。 */
  key: string;
  title: string;
  summary: string;
  href: string;
};

export function TrialPricingHubSections({
  sections,
}: {
  sections: TrialPricingHubSection[];
}) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
      {sections.map((sec) => (
        <HubCard
          color="blue"
          description={sec.summary}
          href={sec.href}
          icon={SECTION_ICONS[sec.key] ?? IconMathFunction}
          key={sec.key}
          label={sec.title}
        />
      ))}
    </SimpleGrid>
  );
}
