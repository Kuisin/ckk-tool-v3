"use client";

/**
 * WorkflowGraph — 工程フロー図（design.md §12.2）の公開コンポーネント。
 *
 * 実体は React Flow の WorkflowGraphCanvas。約 66 kB(gzip) と重く、DOM 計測を
 * 前提に描く（サーバーでは寸法が無いので何も出ない）ので、MemoPanel の
 * エディタと同じく next/dynamic + ssr:false で遅延ロードする。
 *
 * レイアウトは今も lib/workflow-core.ts の layoutWorkflowGraph が持つ —
 * ライブラリは描画層でしかない。
 */

import { Skeleton } from "@mantine/core";
import dynamic from "next/dynamic";
import type { WorkflowGraphProps } from "./WorkflowGraphCanvas";

const WorkflowGraphCanvas = dynamic(
  () => import("./WorkflowGraphCanvas").then((m) => m.WorkflowGraphCanvas),
  { loading: () => <Skeleton height={200} radius="sm" />, ssr: false },
);

export function WorkflowGraph(props: WorkflowGraphProps) {
  return <WorkflowGraphCanvas {...props} />;
}
