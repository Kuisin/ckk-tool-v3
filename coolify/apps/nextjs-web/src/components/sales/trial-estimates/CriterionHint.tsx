"use client";

/**
 * CriterionHint — 価格試算の内訳・結果の各行に付く「ヒント」ボタン。
 * 押すと、その計算基準（SY02 の 計算基準）に管理者が書いた説明が出る。説明が
 * 空の基準にはボタンごと出さない。
 */

import { ActionIcon, Popover, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { type Criterion, DEFAULT_CRITERIA } from "@/lib/trial-pricing-criteria";

/** 基準 id の説明（設定が空のときはエンジンと同じく既定の基準を見る）。 */
export function criterionDescription(
  criteria: readonly Criterion[] | undefined,
  id: string,
): string | undefined {
  const list = criteria?.length ? criteria : DEFAULT_CRITERIA;
  return list.find((c) => c.id === id)?.description;
}

export function CriterionHint({
  description,
  label,
}: {
  description?: string | null;
  /** ヒントの見出し（行のラベル）。 */
  label: string;
}) {
  const tr = useTranslations();
  const text = description?.trim();
  if (!text) return null;
  return (
    <Popover
      position="right"
      shadow="md"
      trapFocus
      width={300}
      withArrow
      withinPortal
    >
      <Popover.Target>
        <ActionIcon
          aria-label={tr("sales.trialEstimates.hintFor", { name: label })}
          color="gray"
          size="sm"
          variant="subtle"
        >
          <IconInfoCircle size={14} />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown>
        <Text fw={600} mb={4} size="xs">
          {label}
        </Text>
        <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>
          {text}
        </Text>
      </Popover.Dropdown>
    </Popover>
  );
}

/** 行のラベル + ヒントボタン（ラベルは折り返さず、ボタンは右隣）。 */
export function LabelWithHint({
  label,
  description,
}: {
  label: string;
  description?: string | null;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {label}
      <CriterionHint description={description} label={label} />
    </span>
  );
}
