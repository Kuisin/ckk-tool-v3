"use client";

/**
 * SummaryBars — 件数の横棒。集計に出るグラフはこれ 1 種類だけ。
 *
 * なぜ図書館（chart ライブラリ）を入れないか:
 * ここに出るのはすべて **1 系列の件数** で、必要な形は「多い順に並んだ横棒」
 * だけ。横棒なら日本語の長いラベルが切れず、375px でも読める（縦棒だと
 * ラベルが斜めになるか省略される）。1 系列なので色は 1 色でよく、凡例も
 * 要らない。div 1 枚で足りるものに 500KB の依存を足す理由が無い。
 *
 * 描き方は design skill の mark spec に従う:
 *   - 棒は 24px 以下。帯の残りは余白にする（枠いっぱいに塗らない）
 *   - データ端だけ 4px の丸み、基線側は角のまま
 *   - 目盛り線は引かず、数値を棒の隣に直接置く
 *   - 文字は本文の色。棒の色を文字に使わない
 */

import { Box, Group, Stack, Text } from "@mantine/core";
import { useTranslations } from "next-intl";

export interface BarItem {
  label: string;
  count: number;
}

const BAR_HEIGHT = 14;

/**
 * 帯の最大幅。画面いっぱいに伸ばすと、棒グラフというより読み込みバーに見える。
 * 比較に必要なのは長さの差であって、絶対的な長さではない。
 */
const MAX_PLOT_WIDTH = 560;

export function SummaryBars({
  items,
  total,
  /** 割合を出すか（複数選択は合計が回答数を超えるので出さない）。 */
  showPercent = true,
  emptyMessage,
}: {
  items: BarItem[];
  /** 割合の分母。既定は最大値ではなく回答数。 */
  total: number;
  showPercent?: boolean;
  emptyMessage?: string;
}) {
  const tr = useTranslations();
  if (items.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyMessage ?? tr("forms.summaryCharts.noResponses")}
      </Text>
    );
  }

  // 棒の長さは「最大値に対する比」で取る。回答数を分母にすると、
  // 票が割れたときに全部の棒が短くなって差が読めない。
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <Stack gap="xs">
      {items.map((item) => {
        // 0 件は棒を出さない。最低幅を持たせると「0 なのに何かある」という
        // 嘘になる（実際に 0 件の区間が塗られていた）。
        const width =
          item.count === 0 ? 0 : Math.max(1, (item.count / max) * 100);
        const percent =
          showPercent && total > 0
            ? Math.round((item.count / total) * 1000) / 10
            : null;
        return (
          <Box key={item.label}>
            <Group
              gap="xs"
              justify="space-between"
              maw={MAX_PLOT_WIDTH}
              wrap="nowrap"
            >
              {/* ラベルは折り返す。切ると何の項目か分からなくなる。 */}
              <Text size="sm" style={{ minWidth: 0, wordBreak: "break-word" }}>
                {item.label}
              </Text>
              {/* 数値は棒の隣に直接置く（目盛り線は引かない）。 */}
              <Text
                className="tabular-nums"
                fw={600}
                size="sm"
                style={{ flexShrink: 0 }}
              >
                {item.count}
                {percent !== null && (
                  <Text c="dimmed" component="span" size="xs">
                    {" "}
                    ({percent}%)
                  </Text>
                )}
              </Text>
            </Group>
            <Box
              maw={MAX_PLOT_WIDTH}
              mt={4}
              style={{
                height: BAR_HEIGHT,
                // 下地はダークモードで別に選ぶ（明るいグレーをそのまま出すと
                // 暗い画面で下地のほうが目立ってしまう）。
                background:
                  "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <Box
                style={{
                  width: `${width}%`,
                  height: "100%",
                  // blue-5 は白地に対して 3:1 を切る。図形（文字でない）でも
                  // 3:1 は要るので blue-6 にする。暗い画面では逆に沈むので
                  // blue-4 を選ぶ（自動反転ではなく、それぞれで選んだ値）。
                  background:
                    "light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))",
                  // データ端だけ丸め、基線（左）は角のまま。
                  borderRadius: "2px 4px 4px 2px",
                }}
              />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

/** 代表値などを並べる小さな数字の列（棒 1 本のグラフを描くより読める）。 */
export function StatRow({
  stats,
}: {
  stats: { label: string; value: string | number }[];
}) {
  return (
    <Group gap="xl" wrap="wrap">
      {stats.map((s) => (
        <Stack gap={2} key={s.label}>
          <Text c="dimmed" size="xs">
            {s.label}
          </Text>
          <Text className="tabular-nums" fw={600} size="lg">
            {s.value}
          </Text>
        </Stack>
      ))}
    </Group>
  );
}
