"use client";

/**
 * 所有区分（社用 / 私用）の表示。SY0D・SY09・SY01 で同じ見た目にする。
 *
 * **根拠の強さを隠さない**のがこの表示の要点。素のブラウザでは所有を検証
 * できないので、「社内 NW にいる」を「社給端末」と読ませてはいけない
 * （判定規則は lib/device-ownership-core.ts）。
 */

import { Badge, Text, Tooltip } from "@mantine/core";
import { useTranslations } from "next-intl";
import type { DeviceOwnership } from "@/lib/device-ownership-core";

function ownershipLabels(
  tr: ReturnType<typeof useTranslations>,
): Record<DeviceOwnership, string> {
  return {
    COMPANY_MANAGED: tr("settings.ownership.companyManagedDevice"),
    COMPANY_NETWORK: tr("settings.ownership.companyInHouseNetwork"),
    UNMANAGED: tr("settings.ownership.unmanaged"),
    UNKNOWN: tr("settings.ownership.undetermined"),
  };
}

const COLORS: Record<DeviceOwnership, string> = {
  COMPANY_MANAGED: "green",
  COMPANY_NETWORK: "blue",
  UNMANAGED: "orange",
  UNKNOWN: "gray",
};

/** 判定根拠の説明（ownership_source と併せて読む）。 */
function ownershipHints(
  tr: ReturnType<typeof useTranslations>,
): Record<DeviceOwnership, string> {
  return {
    COMPANY_MANAGED: tr("settings.ownership.confirmedByTheDeviceSKey"),
    COMPANY_NETWORK: tr("settings.ownership.theSourceIpIsWithinThe"),
    UNMANAGED: tr("settings.ownership.thereIsNoEvidenceItIs"),
    UNKNOWN: tr("settings.ownership.noJudgmentMaterialIpUnknown"),
  };
}

export function ownershipLabel(
  tr: ReturnType<typeof useTranslations>,
  value: DeviceOwnership,
): string {
  return ownershipLabels(tr)[value] ?? value;
}

export function OwnershipBadge({
  value,
  source,
  size = "xs",
}: {
  value: DeviceOwnership;
  source?: string | null;
  size?: string;
}) {
  const tr = useTranslations();
  const labels = ownershipLabels(tr);
  const hints = ownershipHints(tr);
  return (
    <Tooltip
      label={
        <>
          <Text size="xs">{hints[value]}</Text>
          {source && (
            <Text c="dimmed" ff="mono" size="xs">
              {tr("settings.ownership.judgmentReason", { source })}
            </Text>
          )}
        </>
      }
      multiline
      w={320}
      withinPortal
    >
      <Badge color={COLORS[value]} size={size} variant="light">
        {labels[value]}
      </Badge>
    </Tooltip>
  );
}

/** 所有区分の選択肢（フィルタ用）。 */
export function ownershipOptions(
  tr: ReturnType<typeof useTranslations>,
): Array<{ value: DeviceOwnership; label: string }> {
  const labels = ownershipLabels(tr);
  return (Object.keys(labels) as DeviceOwnership[]).map((value) => ({
    value,
    label: labels[value],
  }));
}
