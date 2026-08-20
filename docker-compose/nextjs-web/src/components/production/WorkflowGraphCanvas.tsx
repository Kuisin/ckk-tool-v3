"use client";

/**
 * WorkflowGraphCanvas — 工程フロー図の実体（React Flow）。design.md §12.2。
 *
 * レイアウトは lib/workflow-core.ts の layoutWorkflowGraph（純関数・kiosk と
 * 双子ファイル・ユニットテスト済み）が持ち、ここは {layer, row} を座標へ
 * 写して描くだけ。**React Flow にレイアウトも妥当性判定もさせない** —
 * 描画層として差し替え可能に保つための境界。
 *
 * 縦方向がフロー（layer → Y）、横方向がレーン（メインライン = 0 /
 * 分岐系列 = 1..）。メインラインの暗黙フロー（kind:"flow"）は灰の実線、
 * 分岐・合流（kind:"link"）は橙の破線 + 数量ラベル（動的エッジは解決値 or
 * 「全量」）。進行中の工程へ入るエッジだけアニメーションする。
 *
 * 直接 import せず WorkflowGraph 経由で使うこと（next/dynamic + ssr:false）。
 */

import { Box, useComputedColorScheme } from "@mantine/core";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import { useEffect } from "react";
import {
  layoutWorkflowGraph,
  type StepLinkState,
  type StepState,
} from "@/lib/workflow-core";
import {
  STEP_NODE_WIDTH,
  type StepFlowNode,
  WorkflowStepNode,
} from "./WorkflowStepNode";
import type { StepLinkView, WorkOrderStepView } from "./work-orders/model";

import "@xyflow/react/dist/style.css";

/** レーン間隔（X）と段間隔（Y）。ノード実寸より広く取る。 */
const X_PITCH = 240;
const Y_PITCH = 128;
/** 高さ見積り（キャンバス高さの算出用。実寸は React Flow が計測する）。 */
const NODE_HEIGHT_ESTIMATE = 82;
const MIN_HEIGHT = 200;

const FLOW_COLOR = "var(--mantine-color-gray-6)";
const LINK_COLOR = "var(--mantine-color-orange-6)";

// React Flow の組み込み aria-label は英語なので、UI に合わせて日本語にする。
const ARIA_LABELS = {
  "controls.ariaLabel": "フロー図の操作",
  "controls.fitView.ariaLabel": "全体を表示",
  "controls.zoomIn.ariaLabel": "拡大",
  "controls.zoomOut.ariaLabel": "縮小",
};

// モジュールスコープで固定 — 毎レンダー新しいオブジェクトを渡すと
// React Flow が警告 #002 を出し、ノードが作り直される。
const nodeTypes = { workflowStep: WorkflowStepNode };

export interface WorkflowGraphProps {
  steps: WorkOrderStepView[];
  links: StepLinkView[];
  /** 選択中の工程（リスト側と同期。強調枠で表示）。 */
  selectedStepId?: string | null;
  onSelectStep?: (stepId: string) => void;
  /** キャンバス高さの上限。内容が収まるときはその高さまでしか使わない。 */
  maxHeight?: number;
}

function Canvas({
  steps,
  links,
  selectedStepId,
  onSelectStep,
  maxHeight = 520,
}: WorkflowGraphProps) {
  const colorScheme = useComputedColorScheme("light", {
    getInitialValueInEffect: false,
  });
  const { fitView } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

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

  const stepOf = new Map(steps.map((s) => [s.id, s]));
  const flowNodes: StepFlowNode[] = nodes.flatMap((n) => {
    const step = stepOf.get(n.id);
    if (!step) return [];
    return [
      {
        id: n.id,
        type: "workflowStep" as const,
        position: { x: n.row * X_PITCH, y: n.layer * Y_PITCH },
        data: { step, highlighted: selectedStepId === n.id },
        ariaLabel: step.name,
        // 位置は layoutWorkflowGraph が決める — 手で動かさせない。
        draggable: false,
        width: STEP_NODE_WIDTH,
      },
    ];
  });

  const flowEdges: Edge[] = edges.map((e) => {
    const isLink = e.kind === "link";
    const color = isLink ? LINK_COLOR : FLOW_COLOR;
    return {
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      // 進行中の工程へ流れ込むエッジだけ動かす（いま現場が動いている所）。
      animated: stepOf.get(e.to)?.status === "IN_PROGRESS",
      label: isLink ? e.label : undefined,
      labelBgBorderRadius: 4,
      labelBgPadding: [4, 2] as [number, number],
      labelBgStyle: { fill: "var(--mantine-color-body)" },
      labelStyle: {
        fill: "var(--mantine-color-orange-7)",
        fontSize: 10,
        fontWeight: 600,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        height: 16,
        width: 16,
      },
      style: {
        stroke: color,
        strokeDasharray: isLink ? "5 3" : undefined,
        strokeWidth: 1.5,
      },
    };
  });

  // 内容が収まるなら小さく、収まらなければ maxHeight まで（あとはズーム/パン）。
  const maxLayer = nodes.reduce((m, n) => Math.max(m, n.layer), 0);
  const contentHeight = maxLayer * Y_PITCH + NODE_HEIGHT_ESTIMATE + 32;
  const height = Math.max(MIN_HEIGHT, Math.min(maxHeight, contentHeight));

  // 工程の増減（分岐の追加・削除）で描画範囲が変わるので測り直して収める。
  // 数量だけの更新では signature が変わらず、視点は動かない。
  const signature = flowNodes.map((n) => n.id).join("|");
  useEffect(() => {
    // signature が空 = ノード無し。収める対象が無いので何もしない。
    if (!nodesInitialized || signature === "") return;
    void fitView({ duration: 200, padding: 0.15 });
  }, [nodesInitialized, signature, fitView]);

  return (
    <Box style={{ height, width: "100%" }}>
      <ReactFlow
        // ReactFlow のルート div は role="application" を持ち、残りの props を
        // そのまま流すので、図の名前はここに付ける。
        aria-label="工程ワークフローのフロー図（分岐・合流）"
        ariaLabelConfig={ARIA_LABELS}
        colorMode={colorScheme}
        edges={flowEdges}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        maxZoom={1.5}
        minZoom={0.25}
        nodes={flowNodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelectStep?.(node.id)}
        // ページのスクロールを奪わない（詳細画面に埋め込まれているため）。
        // 拡大縮小は Controls とピンチで行う。
        preventScrolling={false}
        zoomOnScroll={false}
      >
        <Background gap={16} size={1} />
        {/* ミニマップは置かない — 詳細画面に埋め込む小さいパネルでは、
            浮いたパネルが工程ノードを覆ってしまう（実測）。全体表示は
            Controls の fitView で足りる。 */}
        <Controls orientation="horizontal" showInteractive={false} />
      </ReactFlow>
    </Box>
  );
}

export function WorkflowGraphCanvas(props: WorkflowGraphProps) {
  // useReactFlow / useNodesInitialized は Provider の内側でしか使えない。
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
