"use client";

/**
 * WorkflowGraph — 工程フローの縦型 SVG キャンバス (design.md §12.2)。
 *
 * lib/workflow-core.ts の layoutWorkflowGraph（純関数）でレイアウトを計算し、
 * 手書きのインライン SVG で描画する（外部依存なし）。縦方向がフロー
 * （layer → Y）、横方向がレーン（メインライン = 0、分岐系列 = 1.. → X）。
 * メインラインの暗黙フロー（kind:"flow"）は無ラベルの線、分岐・合流エッジ
 * （kind:"link"）は色付き + 数量ラベル（動的エッジは解決値 or「全量」）。
 * ノードクリックで onSelectStep — ステップリスト側と選択を同期する。
 * リンクの無い直列指示書でも常時描画する。
 */

import { Box } from "@mantine/core";
import {
  layoutWorkflowGraph,
  type StepLinkState,
  type StepState,
} from "@/lib/workflow-core";
import type { StepLinkView, WorkOrderStepView } from "./work-orders/model";

const NODE_W = 172;
const NODE_H = 58;
const X_PITCH = 200;
const Y_PITCH = 88;
const PAD = 12;

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

function truncate(name: string, max = 10): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

export function WorkflowGraph({
  steps,
  links,
  selectedStepId,
  onSelectStep,
  maxHeight = 520,
}: {
  steps: WorkOrderStepView[];
  links: StepLinkView[];
  /** 選択中の工程（リスト側と同期。強調枠で表示）。 */
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
  maxHeight?: number;
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

  // 縦レイアウト: レーン → X、layer → Y
  const pos = new Map(
    nodes.map((n) => [
      n.id,
      { x: PAD + n.row * X_PITCH, y: PAD + n.layer * Y_PITCH },
    ]),
  );
  const stepOf = new Map(steps.map((s) => [s.id, s]));
  const width =
    PAD * 2 + Math.max(0, ...nodes.map((n) => n.row)) * X_PITCH + NODE_W;
  const height =
    PAD * 2 + Math.max(0, ...nodes.map((n) => n.layer)) * Y_PITCH + NODE_H;

  return (
    <Box style={{ overflow: "auto", maxHeight }}>
      <svg
        aria-label="工程ワークフローのフロー図（分岐・合流）"
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
          <marker
            id="wf-arrow-branch"
            markerHeight={6}
            markerWidth={7}
            orient="auto-start-reverse"
            refX={6}
            refY={3}
          >
            <path d="M0,0 L7,3 L0,6 Z" fill="var(--mantine-color-orange-6)" />
          </marker>
        </defs>

        {/* エッジ: 分岐元下端 → 先頭上端 の縦ベジェ（flow = 灰 / link = 橙 + 数量） */}
        {edges.map((e) => {
          const from = pos.get(e.from);
          const to = pos.get(e.to);
          if (!from || !to) return null;
          const sx = from.x + NODE_W / 2;
          const sy = from.y + NODE_H;
          const tx = to.x + NODE_W / 2;
          const ty = to.y;
          const my = (sy + ty) / 2;
          const isLink = e.kind === "link";
          return (
            <g key={`${e.from}-${e.to}`}>
              <path
                d={`M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`}
                fill="none"
                markerEnd={isLink ? "url(#wf-arrow-branch)" : "url(#wf-arrow)"}
                stroke={
                  isLink
                    ? "var(--mantine-color-orange-6)"
                    : "var(--mantine-color-gray-6)"
                }
                strokeDasharray={isLink ? "5 3" : undefined}
                strokeWidth={1.5}
              />
              {isLink && e.label && (
                <text
                  fill="var(--mantine-color-orange-7)"
                  fontSize={10}
                  fontWeight={600}
                  textAnchor="middle"
                  x={(sx + tx) / 2 + (sx === tx ? 14 : 0)}
                  y={my - 4}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {/* ノード（工程） */}
        {nodes.map((n) => {
          const p = pos.get(n.id);
          const s = stepOf.get(n.id);
          if (!p || !s) return null;
          const color = STATUS_FILL[s.status] ?? STATUS_FILL.PENDING;
          const selected = selectedStepId === n.id;
          const qty =
            s.inputQuantity != null
              ? `受入 ${s.inputQuantity}${
                  s.outputSuccessQuantity != null
                    ? ` / 良品 ${s.outputSuccessQuantity}`
                    : ""
                }`
              : null;
          return (
            // biome-ignore lint/a11y/useSemanticElements: SVG 内のクリック可能ノード
            <g
              key={n.id}
              onClick={() => onSelectStep?.(n.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") onSelectStep?.(n.id);
              }}
              role="button"
              style={{ cursor: onSelectStep ? "pointer" : undefined }}
              tabIndex={onSelectStep ? 0 : undefined}
            >
              <rect
                fill={color.fill}
                height={NODE_H}
                rx={8}
                stroke={selected ? "var(--mantine-color-blue-6)" : color.stroke}
                strokeWidth={selected ? 2.5 : 1}
                width={NODE_W}
                x={p.x}
                y={p.y}
              />
              <text
                fill="var(--mantine-color-text)"
                fontSize={12}
                fontWeight={600}
                x={p.x + 12}
                y={p.y + 23}
              >
                <title>{s.name}</title>
                {truncate(s.name)}
              </text>
              {qty ? (
                <text
                  fill="var(--mantine-color-dimmed)"
                  fontSize={10}
                  x={p.x + 12}
                  y={p.y + 42}
                >
                  {qty}
                </text>
              ) : (
                <text
                  fill="var(--mantine-color-dimmed)"
                  fontSize={10}
                  x={p.x + 12}
                  y={p.y + 42}
                >
                  {s.status === "CANCELLED" ? "キャンセル" : "未着手"}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
