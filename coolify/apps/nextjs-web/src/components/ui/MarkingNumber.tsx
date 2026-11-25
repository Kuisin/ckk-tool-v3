/**
 * MarkingNumber.tsx — 印字番号（製品にレーザーで刻む通し番号）の表示。
 *
 * 1 本ずつ刻むときの範囲（A200000-001 〜 A200000-050）と、明細ごとに 1 つ
 * 刻むときの番号（A200000）を**両方**出す。どちらで刻むかは注文明細に
 * 持たない（lib/marking-number.ts）ので、画面が片方に決め打ちしない。
 *
 * 基数が無い（確定前・この機能より前に確定した明細）ときは「未採番」。
 */

import { Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";
import { DocNumber } from "@/components/ui/DocNumber";
import { markingRange } from "@/lib/marking-number";

export function MarkingNumber({
  base,
  quantity,
}: {
  base: number | null;
  quantity: number;
}) {
  const tr = useTranslations();
  if (base == null) {
    return (
      <Text c="dimmed" component="span" size="sm">
        {tr("common.markingNotIssued")}
      </Text>
    );
  }
  const r = markingRange(base, quantity);
  return (
    <Stack component="span" gap={2}>
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
          {tr("common.markingPerLine")}
        </Text>
        <DocNumber>{r.perLine}</DocNumber>
      </Group>
    </Stack>
  );
}
