"use client";

/**
 * SeriesMemoSection — 系列メモ（製品 × 受注元の図面で全版共通のメモ）の枠。
 *
 * - 版の詳細（versions/[id]）: 書ける（MemoPanel — 製品の設計図画面と同じ部品・
 *   同じ持ち主なので、どちらで直しても同じ 1 件）。版の状態とは独立に書ける —
 *   凍るのは図面の中身であって、系列への注記ではない。
 * - 工程実行画面: 読むだけ。どの系列かを添え、書き直しは設計図へ誘導する。
 *   メモが無ければ枠ごと出さない（加工プログラムの枠と同じ — 空の枠を毎回
 *   見せない）。
 */

import { Anchor, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { useTranslations } from "next-intl";
import { MemoPanel } from "@/components/ui/MemoPanel";
import { RichTextView } from "@/components/ui/RichTextView";
import { designSeriesOwnerId, seriesParam } from "@/lib/design-files-core";
import type { MemoView } from "@/lib/document-memos";

/** 製品の設計図画面の、その系列の節へのリンク。 */
function seriesHref(itemId: number, customerBpId: string | null): string {
  const param = seriesParam(customerBpId);
  return `/production/design-files/${itemId}?series=${encodeURIComponent(param)}#series-${param}`;
}

/** 版の詳細: 書ける系列メモ。 */
export function SeriesMemoEditor({
  itemId,
  customerBpId,
  memos,
}: {
  itemId: number;
  customerBpId: string | null;
  memos: MemoView[];
}) {
  const tr = useTranslations();
  const ownerId = designSeriesOwnerId(itemId, customerBpId);
  return (
    <Paper data-series-memo p="md" radius="md" withBorder>
      <Title mb={4} order={5}>
        {tr("production.designFiles.seriesMemo")}
      </Title>
      <Text c="dimmed" mb="xs" size="xs">
        {tr("production.designFiles.seriesMemoHint")}
      </Text>
      <MemoPanel
        memos={memos}
        mode="memo"
        ownerId={ownerId}
        ownerType="design_series"
      />
    </Paper>
  );
}

/** 工程実行画面: 読むだけの系列メモ（無ければ何も描かない）。 */
export function SeriesMemoReadOnly({
  itemId,
  customerBpId,
  seriesLabel,
  memos,
}: {
  itemId: number;
  customerBpId: string | null;
  seriesLabel: string;
  memos: MemoView[];
}) {
  const tr = useTranslations();
  const memo = memos.find((m) => m.archivedAt == null) ?? null;
  if (!memo) return null;
  return (
    <Paper data-series-memo p="md" radius="md" withBorder>
      <Stack gap="xs">
        <Group justify="space-between" wrap="wrap">
          <Title order={5}>{tr("production.designFiles.seriesMemo")}</Title>
          <Anchor href={seriesHref(itemId, customerBpId)} size="sm">
            {tr("production.designFiles.seriesMemoOpen")}
          </Anchor>
        </Group>
        <Text c="dimmed" size="xs">
          {tr("production.designFiles.seriesMemoReadOnlyHint", {
            series: seriesLabel,
          })}
        </Text>
        <RichTextView doc={memo.content} linkTargets={memo.linkTargets} />
      </Stack>
    </Paper>
  );
}
