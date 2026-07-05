/**
 * DocNumber.tsx — monospace document number (QOT-/ORD-/DRN-/INV-…)
 * (_specs/design.md §1.2 — ff="mono" + tabular figures).
 */

import { Text } from "@mantine/core";
import type { ReactNode } from "react";

export function DocNumber({
  children,
  c,
}: {
  children: ReactNode;
  c?: string;
}) {
  return (
    <Text c={c} className="tabular-nums" ff="mono" size="sm">
      {children}
    </Text>
  );
}
