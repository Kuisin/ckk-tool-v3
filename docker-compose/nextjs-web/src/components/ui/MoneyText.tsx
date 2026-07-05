/**
 * MoneyText.tsx — formatted currency (_specs/design.md §10.7).
 */

import { Text } from "@mantine/core";
import { formatMoney } from "@/lib/format";

export function MoneyText({
  value,
  currency,
  ta = "right",
}: {
  value: number | null | undefined;
  currency?: string;
  ta?: "left" | "right";
}) {
  return (
    <Text className="tabular-nums" ff="mono" size="sm" span ta={ta}>
      {formatMoney(value, currency)}
    </Text>
  );
}
