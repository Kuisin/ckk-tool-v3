"use client";

/**
 * SummaryCharts — 集計のグラフ（ドーナツ / 縦棒）。横棒は SummaryBars。
 *
 * **なぜ図書館（chart ライブラリ）を入れないか**は SummaryBars と同じ理由。
 * ここで要るのは 1 系列の件数を「割合として見る」か「並びとして見る」かの
 * 2 通りだけで、どちらも SVG と div で足りる。500KB の依存を足す仕事ではない。
 *
 * **型ごとに形を変える**（Google フォーム / Microsoft Forms と同じ考え方）:
 *   1 つ選ぶ（select / lookup）… 全体に対する構成 → **ドーナツ**
 *   複数選ぶ（multiselect）    … 部分の和が全体を超える → **横棒**（円にしない）
 *   数値の分布・日付の推移      … 順序に意味がある → **縦棒**（左から右へ時間）
 *   自由記述                    … 数えても意味が無い → グラフにしない
 *
 * multiselect を円にしないのは見た目の好みではない。1 人が 2 つ選べる質問で
 * 円を描くと、面積の合計が回答数を超えて「全体の 40%」が嘘になる。
 */

import { Box, Group, Stack, Text } from "@mantine/core";
import { useTr } from "@/hooks/useTr";
import { type CountItem, donutArcs } from "@/lib/form-summary";

/**
 * 区分ごとの色。ドーナツは**色でしか区分を示せない**ので、隣り合う色は
 * 色相を離す。暗い画面では 6 番が沈むので 4 番を選ぶ（自動反転ではなく、
 * それぞれで選んだ値）。
 */
const SLICE_COLORS = [
  "light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))",
  "light-dark(var(--mantine-color-teal-6), var(--mantine-color-teal-4))",
  "light-dark(var(--mantine-color-grape-6), var(--mantine-color-grape-4))",
  "light-dark(var(--mantine-color-orange-6), var(--mantine-color-orange-4))",
  "light-dark(var(--mantine-color-cyan-7), var(--mantine-color-cyan-4))",
  "light-dark(var(--mantine-color-pink-6), var(--mantine-color-pink-4))",
  "light-dark(var(--mantine-color-lime-7), var(--mantine-color-lime-4))",
  "light-dark(var(--mantine-color-indigo-6), var(--mantine-color-indigo-4))",
];

export function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length];
}

/** ドーナツにしてよい区分の数。これを超えると色が足りず、読めなくなる。 */
export const MAX_DONUT_SLICES = SLICE_COLORS.length;

const DONUT_SIZE = 168;
const DONUT_RADIUS = 62;
const DONUT_THICKNESS = 26;

function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

/**
 * ドーナツ。**部分の和が全体になる**質問（1 つだけ選ぶ）にしか使わない。
 *
 * 図そのものは色しか語らないので、数字は必ず横の凡例に文字で出す
 * （色が判別できない人にも、白黒で印刷した人にも同じ情報が残る）。
 */
export function DonutChart({
  items,
  total,
}: {
  items: CountItem[];
  /** 割合の分母。回答した件数。 */
  total: number;
}) {
  const tr = useTr();
  const circumference = 2 * Math.PI * DONUT_RADIUS;
  // 寸法の計算は lib/form-summary.ts が持つ（部品の中に閉じ込めると、
  // 確かめるのに画面を開かないといけなくなる）。
  const arcs = donutArcs(items, total, circumference);

  const label = items
    .map((i) =>
      tr("{label} {count}件（{v2}%）", {
        label: i.label,
        count: i.count,
        v2: percent(i.count, total),
      }),
    )
    .join("、");

  return (
    <Group align="center" gap="xl" wrap="wrap">
      <Box
        aria-label={label}
        role="img"
        style={{ flexShrink: 0, width: DONUT_SIZE, height: DONUT_SIZE }}
      >
        <svg
          aria-hidden="true"
          height={DONUT_SIZE}
          viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
          width={DONUT_SIZE}
        >
          <title>{label}</title>
          {/* 下地。0 件の区分が続いても輪が欠けて見えないように。 */}
          <circle
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            fill="none"
            r={DONUT_RADIUS}
            strokeWidth={DONUT_THICKNESS}
            style={{
              stroke:
                "light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-5))",
            }}
          />
          {arcs.map((arc, i) => (
            <circle
              cx={DONUT_SIZE / 2}
              cy={DONUT_SIZE / 2}
              fill="none"
              key={arc.label}
              r={DONUT_RADIUS}
              // 12 時から時計回り。既定（3 時から）だと、凡例の 1 番目が
              // 右横から始まって並びと対応しない。
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
              strokeWidth={DONUT_THICKNESS}
              style={{ stroke: sliceColor(i) }}
              transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
            />
          ))}
          <text
            dy="0.35em"
            fill="currentColor"
            fontSize="22"
            fontWeight="600"
            textAnchor="middle"
            x={DONUT_SIZE / 2}
            y={DONUT_SIZE / 2}
          >
            {total}
          </text>
        </svg>
      </Box>

      <Stack gap={6} style={{ flex: 1, minWidth: 200 }}>
        {items.map((item, i) => (
          <Group gap="xs" key={item.label} wrap="nowrap">
            <Box
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                flexShrink: 0,
                background: sliceColor(i),
              }}
            />
            <Text size="sm" style={{ minWidth: 0, wordBreak: "break-word" }}>
              {item.label}
            </Text>
            <Text
              className="tabular-nums"
              fw={600}
              size="sm"
              style={{ marginLeft: "auto", flexShrink: 0 }}
            >
              {item.count}
              <Text c="dimmed" component="span" size="xs">
                {" "}
                ({percent(item.count, total)}%)
              </Text>
            </Text>
          </Group>
        ))}
      </Stack>
    </Group>
  );
}

const COLUMN_PLOT_HEIGHT = 132;

/**
 * 縦棒。**並びに意味がある**もの（日付の推移・数値の区間）に使う。
 *
 * 横棒だと上から下へ時間が流れることになり、「左から右へ」という読み方と
 * 合わない。区分名は下に置くので、長い名前は折り返す前提で幅を確保する。
 * 区分が多すぎると 1 本が数 px になるので、その判断は呼び出し側が行う
 * （狭い画面では横棒に落とす）。
 */
export function ColumnChart({
  items,
  emptyMessage = "回答がありません",
}: {
  items: CountItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        {emptyMessage}
      </Text>
    );
  }

  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <Group
      align="flex-end"
      gap="xs"
      style={{ overflowX: "auto" }}
      wrap="nowrap"
    >
      {items.map((item) => {
        // 0 件は棒を描かない。最低の高さを与えると「0 なのに何かある」という
        // 嘘になる。
        const height = item.count === 0 ? 0 : (item.count / max) * 100;
        return (
          <Stack
            align="center"
            gap={4}
            key={item.label}
            style={{ flex: "1 1 0", minWidth: 44 }}
          >
            <Text className="tabular-nums" fw={600} size="xs">
              {item.count}
            </Text>
            {/* 棒の後ろに帯は敷かない。横棒（SummaryBars）は 1 行 1 本なので
                帯が「目盛りの幅」として読めるが、縦棒で 1 本ずつ帯を敷くと
                低い棒が「読み込み中のバー」に見えて、結果なのか途中なのかが
                判らなくなる。高さの比較には、揃った基線があれば足りる。 */}
            <Box
              style={{
                width: "100%",
                maxWidth: 48,
                height: COLUMN_PLOT_HEIGHT,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <Box
                style={{
                  width: "100%",
                  height: `${height}%`,
                  background:
                    "light-dark(var(--mantine-color-blue-6), var(--mantine-color-blue-4))",
                  // データ端（上）だけ丸め、基線側は角のまま。
                  borderRadius: "4px 4px 0 0",
                }}
              />
            </Box>
            <Text c="dimmed" size="xs" style={{ lineHeight: 1.3 }} ta="center">
              {item.label}
            </Text>
          </Stack>
        );
      })}
    </Group>
  );
}
