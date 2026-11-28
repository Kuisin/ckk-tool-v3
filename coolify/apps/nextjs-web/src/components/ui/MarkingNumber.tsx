/**
 * MarkingNumber.tsx — 印字番号（製品にレーザーで刻む通し番号）の表示。
 *
 * 1 本ずつ刻むときの範囲（A200000-001 〜 A200000-050）と、明細ごとに 1 つ
 * 刻むときの番号（A200000）を**両方**出す。どちらで刻むかは注文明細に
 * 持たない（lib/marking-number.ts）ので、画面が片方に決め打ちしない。
 *
 * 指示書の割当 1 件ぶんを出すときは `split`（分割番号）と `allocatedQuantity`
 * を渡す。分割（split > 0）なら接頭辞は A{base}{split}・範囲は割当数量ぶんで、
 * 「明細ごと」は「分割ごと」になる。
 *
 * 基数が無い（確定前・この機能より前に確定した明細）ときは「未採番」。
 */

import { Badge, Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { DocNumber } from "@/components/ui/DocNumber";
import { allocationMarkingRange } from "@/lib/marking-number";

export function MarkingNumber({
  base,
  quantity,
  split,
  allocatedQuantity,
}: {
  base: number | null;
  /** 明細の受注数量。 */
  quantity: number;
  /** 割当の分割番号（0 / null / 省略 = 分割でない）。 */
  split?: number | null;
  /** 割当数量（分割のときの範囲）。省略時は受注数量。 */
  allocatedQuantity?: number;
}) {
  const tr = useTranslations();
  if (base == null) {
    return (
      <Text c="dimmed" component="span" size="sm">
        {tr("common.markingNotIssued")}
      </Text>
    );
  }
  const r = allocationMarkingRange({
    base,
    split,
    lineQuantity: quantity,
    allocatedQuantity: allocatedQuantity ?? quantity,
  });
  return (
    <Stack component="span" gap={2}>
      {r.split != null && (
        <Group component="span" gap={6}>
          <Badge color="grape" size="xs" variant="light">
            {tr("common.markingSplit", { split: r.split })}
          </Badge>
        </Group>
      )}
      <Group component="span" gap={6} wrap="wrap">
        <Text c="dimmed" component="span" size="xs">
          {tr("common.markingPerPiece")}
        </Text>
        <DocNumber>
          {tr("common.markingRange", { first: r.first, last: r.last })}
        </DocNumber>
      </Group>
      <Group component="span" gap={6} wrap="wrap">
        <Text c="dimmed" component="span" size="xs">
          {r.split != null
            ? tr("common.markingPerSplit")
            : tr("common.markingPerLine")}
        </Text>
        <DocNumber>{r.perLine}</DocNumber>
      </Group>
    </Stack>
  );
}
