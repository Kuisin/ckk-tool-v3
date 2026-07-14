"use client";

/**
 * WorkflowGraph — 工程 DAG（分岐・合流）の SVG 表示 (design.md §12.2)。
 *
 * lib/workflow-core.ts の layoutWorkflowGraph（純関数）で層状レイアウトを計算し、
 * 手書きのインライン SVG で描画する（外部依存なし）。
 * ノード = 工程（状態色の角丸矩形 + 工程名 + 数量）、エッジ = 分岐リンク
 * （3次ベジェ + routedQuantity ラベル）。リンクが無い指示書では描画しない
 * （親側で出し分ける）。
 */

import { Box } from "@mantine/core";
import {
  layoutWorkflowGraph,
  type StepLinkState,
  type StepState,
} from "@/lib/workflow-core";
import type { StepLinkView, WorkOrderStepView } from "./work-orders/model";

const NODE_W = 156;
const NODE_H = 56;
const X_PITCH = 196;
const Y_PITCH = 72;
const PAD = 8;

/** 状態 → 塗り / 枠 / 文字色（Mantine light パレット CSS 変数）。 */
const STATUS_FILL: Record<string, { fill: string; stroke: string }> = {
  PENDING: {
    fill: "var(--mantine-color-gray-1)",
    stroke: "var(--mantine-color-gray-5)",
  },
  IN_PROGRESS: {
    fill: "var(--mantine-color-blue-1)",
    stroke: "var(--mantine-color-blue-5)",
  },
  COMPLETED: {
    fill: "var(--mantine-color-green-1)",
    stroke: "var(--mantine-color-green-5)",
  },
  CANCELLED: {
    fill: "var(--mantine-color-red-1)",
    stroke: "var(--mantine-color-red-5)",
  },
};

function truncate(name: string, max = 9): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

export function WorkflowGraph({
  steps,
  links,
}: {
  steps: WorkOrderStepView[];
  links: StepLinkView[];
}) {
  // view model → engine 形式（レイアウト計算に必要な部分のみ実値）
  const engineSteps: StepState[] = steps.map((s) => ({
    id: s.id,
    processStepId: s.processStepId,
    status: s.status as StepState["status"],
    sortOrder: s.sortOrder,
    inputQuantity: s.inputQuantity,
    outputSuccess: s.outputSuccessQuantity,
    defectSemiFinished: s.outputDefectSemiFinished,
    defectScrap: s.outputDefectScrap,
    defectRework: s.outputDefectRework,
    sessionLockedBy: null,
  }));
  const engineLinks: StepLinkState[] = links.map((l) => ({
    sourceStepId: l.sourceStepId,
    targetStepId: l.targetStepId,
    routedQuantity: l.routedQuantity,
  }));
  const { nodes, edges } = layoutWorkflowGraph(engineSteps, engineLinks);

  const pos = new Map(
    nodes.map((n) => [
      n.id,
      { x: PAD + n.layer * X_PITCH, y: PAD + n.row * Y_PITCH },
    ]),
  );
  const stepOf = new Map(steps.map((s) => [s.id, s]));
  const width =
    PAD * 2 + (Math.max(0, ...nodes.map((n) => n.layer)) + 1) * X_PITCH;
  const height =
    PAD * 2 + (Math.max(0, ...nodes.map((n) => n.row)) + 1) * Y_PITCH;

  return (
    <Box mb="sm" style={{ overflowX: "auto" }}>
      <svg
        aria-label="工程ワークフローの分岐・合流グラフ"
        height={height}
        role="img"
        width={width}
      >
        <defs>
          <marker
            id="wf-arrow"
            markerHeight={6}
            markerWidth={7}
            orient="auto-start-reverse"
            refX={6}
            refY={3}
          >
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--mantine-color-gray-6)" />
          </marker>
        </defs>

        {/* エッジ（分岐リンク）: 分岐元右端 → 合流先左端 の3次ベジェ */}
        {edges.map((e) => {
          const from = pos.get(e.from);
          const to = pos.get(e.to);
          if (!from || !to) return null;
          const sx = from.x + NODE_W;
          const sy = from.y + NODE_H / 2;
          const tx = to.x;
          const ty = to.y + NODE_H / 2;
          const mx = (sx + tx) / 2;
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                fill="none"
                markerEnd="url(#wf-arrow)"
                stroke="var(--mantine-color-gray-6)"
                strokeWidth={1.5}
              />
              <text
                fill="var(--mantine-color-dimmed)"
                fontSize={10}
                textAnchor="middle"
                x={mx}
                y={(sy + ty) / 2 - 4}
              >
                {e.label}
              </text>
            </g>
          );
        })}

        {/* ノード（工程） */}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          const s = stepOf.get(n.id);
          if (!p || !s) return null;
          const color = STATUS_FILL[s.status] ?? STATUS_FILL.PENDING;
          const qty =
            s.inputQuantity != null
              ? `受入 ${s.inputQuantity}${
                  s.outputSuccessQuantity != null
                    ? ` / 良品 ${s.outputSuccessQuantity}`
                    : ""
                }`
              : null;
          return (
            <g key={n.id}>
              <rect
                fill={color.fill}
                height={NODE_H}
                rx={6}
                stroke={color.stroke}
                width={NODE_W}
                x={p.x}
                y={p.y}
              />
              <text
                fill="var(--mantine-color-text)"
                fontSize={12}
                fontWeight={600}
                x={p.x + 10}
                y={p.y + 22}
              >
                <title>{s.name}</title>
                {truncate(s.name)}
              </text>
              {qty && (
                <text
                  fill="var(--mantine-color-dimmed)"
                  fontSize={10}
                  x={p.x + 10}
                  y={p.y + 40}
                >
                  {qty}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
