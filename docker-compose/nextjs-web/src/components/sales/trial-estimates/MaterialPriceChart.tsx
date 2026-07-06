"use client";

/**
 * MaterialPriceChart — 素材価格推移 (仕入実績) の折れ線グラフ.
 *
 * Dependency-free SVG (lockfile is frozen). Plots purchase unit-price over time;
 * clicking a point sets it as the 試算 reference price (onSelect). The currently
 * selected point is highlighted; points inside the policy window are emphasized.
 */

import { Badge, Box, Group, Stack, Text } from "@mantine/core";
import { formatDate, formatMoney } from "@/lib/format";
import type { MaterialPricePoint } from "@/lib/material-pricing-core";

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

export function MaterialPriceChart({
  points,
  selectedDate,
  windowDates,
  onSelect,
}: {
  points: MaterialPricePoint[];
  /** Date of the currently chosen reference point. */
  selectedDate?: string;
  /** Dates inside the policy window (emphasized). */
  windowDates?: string[];
  onSelect?: (p: MaterialPricePoint) => void;
}) {
  if (points.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        この素材の仕入実績がありません。
      </Text>
    );
  }

  const prices = points.map((p) => p.unitPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const x = (i: number) =>
    PAD.left +
    (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (price: number) =>
    PAD.top + innerH - ((price - min) / span) * innerH;

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.unitPrice).toFixed(1)}`,
    )
    .join(" ");

  const inWindow = (d: string) => !windowDates || windowDates.includes(d);
  const selected = points.find((p) => p.date === selectedDate);

  // y-axis gridlines (min / mid / max)
  const ticks = [min, Math.round((min + max) / 2), max];

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          仕入単価の推移
        </Text>
        <Text c="dimmed" size="xs">
          ポイントをクリックして参照価格を変更
        </Text>
      </Group>

      <Box
        aria-label="素材仕入単価の推移"
        component="svg"
        role="img"
        style={{ width: "100%", height: "auto", overflow: "visible" }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* gridlines + y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              stroke="var(--mantine-color-default-border)"
              strokeDasharray="3 3"
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
            />
            <text
              fill="var(--mantine-color-dimmed)"
              fontSize="11"
              textAnchor="end"
              x={PAD.left - 8}
              y={y(t) + 4}
            >
              {`¥${t.toLocaleString("ja-JP")}`}
            </text>
          </g>
        ))}

        {/* line */}
        <path
          d={linePath}
          fill="none"
          stroke="var(--mantine-color-blue-6)"
          strokeWidth="2"
        />

        {/* points */}
        {points.map((p, i) => {
          const isSel = p.date === selectedDate;
          const emphasized = inWindow(p.date);
          return (
            <g
              key={p.date}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              {/* wide hit area — the single interactive (keyboard-focusable) target */}
              {/* biome-ignore lint/a11y/useSemanticElements: an SVG <circle> cannot be a native <button> */}
              <circle
                aria-label={`${p.date} ${formatMoney(p.unitPrice)} を参照価格に設定`}
                cx={x(i)}
                cy={y(p.unitPrice)}
                fill="transparent"
                onClick={() => onSelect?.(p)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect?.(p);
                  }
                }}
                r={14}
                role="button"
                tabIndex={onSelect ? 0 : -1}
              />
              <circle
                cx={x(i)}
                cy={y(p.unitPrice)}
                fill={
                  isSel
                    ? "var(--mantine-color-blue-6)"
                    : "var(--mantine-color-body)"
                }
                r={isSel ? 6 : 4}
                stroke={
                  emphasized
                    ? "var(--mantine-color-blue-6)"
                    : "var(--mantine-color-gray-5)"
                }
                strokeWidth="2"
                style={{ pointerEvents: "none" }}
              />
              {/* x label (date m/d) */}
              <text
                fill="var(--mantine-color-dimmed)"
                fontSize="10"
                textAnchor="middle"
                x={x(i)}
                y={H - 8}
              >
                {p.date.slice(2).replace(/-/g, "/")}
              </text>
            </g>
          );
        })}
      </Box>

      {selected && (
        <Group gap="sm">
          <Badge color="blue" variant="light">
            参照価格 {formatMoney(selected.unitPrice)}
          </Badge>
          <Text c="dimmed" size="xs">
            {formatDate(selected.date)} ・ {selected.supplier} ・{" "}
            {selected.poNumber}
          </Text>
        </Group>
      )}
    </Stack>
  );
}
