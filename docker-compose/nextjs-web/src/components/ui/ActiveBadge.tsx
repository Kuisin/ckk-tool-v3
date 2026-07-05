/**
 * ActiveBadge.tsx — boolean 有効/無効 badge (_specs/design.md §14).
 */

import { Badge } from "@mantine/core";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge color={active ? "green" : "gray"} variant="light">
      {active ? "有効" : "無効"}
    </Badge>
  );
}
