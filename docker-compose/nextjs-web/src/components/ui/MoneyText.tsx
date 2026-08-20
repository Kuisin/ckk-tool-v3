/**
 * MoneyText.tsx — formatted currency (_specs/design.md §10.7).
 */

import { Text } from "@mantine/core";
import { formatMoney } from "@/lib/format";

export function MoneyText({
  value,
  currency,
  ta = "right",
  fw,
}: {
  value: number | null | undefined;
  currency?: string;
  ta?: "left" | "right";
  /** 合計行など、金額そのものを強調したいときだけ（既定は本文と同じ太さ）。 */
  fw?: number;
}) {
  return (
    <Text className="tabular-nums" ff="mono" fw={fw} size="sm" span ta={ta}>
      {formatMoney(value, currency)}
    </Text>
  );
}
