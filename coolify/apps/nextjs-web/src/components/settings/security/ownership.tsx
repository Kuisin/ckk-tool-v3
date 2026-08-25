"use client";

/**
 * 所有区分（社用 / 私用）の表示。SY0D・SY09・SY01 で同じ見た目にする。
 *
 * **根拠の強さを隠さない**のがこの表示の要点。素のブラウザでは所有を検証
 * できないので、「社内 NW にいる」を「社給端末」と読ませてはいけない
 * （判定規則は lib/device-ownership-core.ts）。
 */

import { Badge, Text, Tooltip } from "@mantine/core";
import type { DeviceOwnership } from "@/lib/device-ownership-core";

const LABELS: Record<DeviceOwnership, string> = {
  COMPANY_MANAGED: "会社（管理端末）",
  COMPANY_NETWORK: "会社（社内NW）",
  UNMANAGED: "未管理",
  UNKNOWN: "未判定",
};

const COLORS: Record<DeviceOwnership, string> = {
  COMPANY_MANAGED: "green",
  COMPANY_NETWORK: "blue",
  UNMANAGED: "orange",
  UNKNOWN: "gray",
};

/** 判定根拠の説明（ownership_source と併せて読む）。 */
const HINTS: Record<DeviceOwnership, string> = {
  COMPANY_MANAGED:
    "端末が持つ鍵の署名で確認済み（暗号的な証拠）。デバイストークンだけの場合は状況証拠どまり — 根拠は下の判定理由を参照。",
  COMPANY_NETWORK:
    "送信元 IP が社内ネットワークの範囲内。**社内にいる証拠であって、社給端末である証拠ではありません**（持ち込み PC も VPN も同じ判定になります）。",
  UNMANAGED:
    "社用である証拠がありません。私用端末の可能性はありますが、断定はできません。",
  UNKNOWN: "判定材料がありません（IP 不明、または社内 CIDR が未設定）。",
};

export function ownershipLabel(value: DeviceOwnership): string {
  return LABELS[value] ?? value;
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
  return (
    <Tooltip
      label={
        <>
          <Text size="xs">{HINTS[value]}</Text>
          {source && (
            <Text c="dimmed" ff="mono" size="xs">
              判定理由: {source}
            </Text>
          )}
        </>
      }
      multiline
      w={320}
      withinPortal
    >
      <Badge color={COLORS[value]} size={size} variant="light">
        {LABELS[value]}
      </Badge>
    </Tooltip>
  );
}

/** 所有区分の選択肢（フィルタ用）。 */
export const OWNERSHIP_OPTIONS = (Object.keys(LABELS) as DeviceOwnership[]).map(
  (value) => ({ value, label: LABELS[value] }),
);
