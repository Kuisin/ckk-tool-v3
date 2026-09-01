"use client";

/**
 * ProductDesignFiles — 製品の設計図 (MS24 関連タブ)。**読み取り専用**。
 *
 * 版は **(製品 × 受注元)** ごとの系列で育つので、系列ごとに見出しを付けて
 * 分ける。汎用（受注元なし）が先頭で、以降は版数の多い順。系列を混ぜて
 * 1 本の表にすると「どの顧客の v3 なのか」が読めなくなる。
 *
 * **ここからは変更できない。** 版の登録・メモ編集・削除は 設計図 (PD06) が
 * 持つ。以前はここと設計依頼の完了の 2 箇所に書き込み口があり、採番と
 * is_latest の付け替えを二重に持つことになっていた。見るための場所は
 * 増えてよいが、書く場所は 1 つにする。
 */

import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { IconRuler2 } from "@tabler/icons-react";
import { DesignFileList } from "@/components/production/design-files/DesignFileList";
import type { ProductDesignFile } from "@/components/production/design-files/model";
import { SecondaryButton } from "@/components/ui/buttons";
import { DesignFileThumb } from "@/components/ui/DesignFileViewer";
import { useTr } from "@/hooks/useTr";
import { groupBySeries, pickThumbFile } from "@/lib/design-files-core";

export function ProductDesignFiles({
  productId,
  files,
}: {
  productId: number;
  files: ProductDesignFile[];
}) {
  const tr = useTr();
  const series = groupBySeries(files);

  return (
    <Stack gap="md">
      <Group gap="sm" justify="space-between" wrap="wrap">
        <Text fw={600} size="sm">
          {tr("設計図")}
        </Text>
        <SecondaryButton
          href={`/production/design-files/${productId}`}
          leftSection={<IconRuler2 size={14} />}
        >
          {tr("設計図で管理")}
        </SecondaryButton>
      </Group>

      {series.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("この製品の設計図はまだありません")}
        </Text>
      ) : (
        series.map((g) => {
          // 系列の中で「いま見せたい 1 枚」。規則は design-files-core が持つ
          // ので、設計依頼 (SA26) や設計図 (PD26) のサムネイルと必ず同じ
          // 1 枚を指す。
          const thumb = pickThumbFile(g.files);
          return (
            <Stack gap="xs" key={g.customerBpId ?? "__generic__"}>
              <Group gap="xs" wrap="wrap">
                {g.customerBpId == null ? (
                  <Badge color="gray" variant="light">
                    {tr("汎用")}
                  </Badge>
                ) : (
                  <Badge color="blue" variant="light">
                    {g.files.find((f) => f.customerName)?.customerName ??
                      tr("受注元")}
                  </Badge>
                )}
                <Text c="dimmed" size="xs">
                  最新 v{g.latestVersion}
                </Text>
              </Group>
              {thumb && (
                <Box maw={320}>
                  <DesignFileThumb
                    target={{
                      caption: tr("v{version}（最新）", {
                        version: thumb.version,
                      }),
                      filename: thumb.filename,
                      mimeType: thumb.mimeType,
                      src: `/api/design-files/${encodeURIComponent(thumb.id)}`,
                    }}
                  />
                </Box>
              )}
              <DesignFileList rows={g.files} showSource />
            </Stack>
          );
        })
      )}
    </Stack>
  );
}
