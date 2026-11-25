/**
 * group-inventory.ts — 仕掛品の再設計（#978–#989）と、既存の通し確認（e2e-*.ts）。
 *
 * 2 種類ある:
 *   - `kind: "script"` … 既存の e2e-*.ts をそのまま 1 本として走らせる。チェックが厚い
 *     （台帳を SQL で裏取りする）ので回帰の安全網。画面は要所だけ撮る。
 *   - walk … 仕掛品の振る舞いを、人が目で確かめる順に操作して手順ごとに撮る。
 */

import { semiFinishedPosting } from "./semi-finished-posting";
import type { AnyScenario, ScriptScenario } from "./types";
import { wipAbortApproval } from "./wip-abort-approval";
import { wipAbortReturn } from "./wip-abort-return";
import { wipStartFromBlank } from "./wip-start-from-blank";
import { wipTabClassify } from "./wip-tab-classify";

const WIP = "仕掛品の再設計 (#978–#989)";
const REGRESSION = "既存機能の回帰（e2e スクリプト）";

/** 既存の e2e-*.ts（ヘッダに「fixtures が要る」とあるものは fixtures を付ける）。 */
const scripts: ScriptScenario[] = [
  // ── 仕掛品 ────────────────────────────────────────────────────────────────
  {
    kind: "script",
    id: "e2e-wip-stock",
    title: "仕掛品タブ — 材種 × 加工状態の一覧・名前付け・未分類の分類",
    feature: WIP,
    script: "e2e-wip-stock.ts",
  },
  {
    kind: "script",
    id: "e2e-wip-draw",
    title: "在庫の仕掛品から指示書を始める — 候補 3 区分・予約・消費・共有端末",
    feature: WIP,
    script: "e2e-wip-draw.ts",
    // スクリプト自身も流し直す（冪等）。ここでも流すのは、アプリ起動前に状態を揃えるため。
    fixtures: ["e2e-wip-draw-fixtures.sql"],
    kiosk: true,
  },
  {
    kind: "script",
    id: "e2e-wip-abort",
    title: "指示書の打ち切り — 即時適用・承認待ち・前提が崩れたときの FAILED",
    feature: WIP,
    script: "e2e-wip-abort.ts",
    fixtures: ["e2e-wip-draw-fixtures.sql"],
  },
  // ── 回帰 ──────────────────────────────────────────────────────────────────
  {
    kind: "script",
    id: "e2e-regrind",
    title: "再研磨 — 預り品の台帳・出荷・再研磨品目の値段",
    feature: REGRESSION,
    script: "e2e-regrind.ts",
    fixtures: ["e2e-regrind-fixtures.sql"],
  },
  {
    kind: "script",
    id: "e2e-ship-shortage",
    title: "在庫が足りないまま出荷する — 確認ダイアログと台帳",
    feature: REGRESSION,
    script: "e2e-ship-shortage.ts",
    fixtures: ["e2e-ship-shortage-fixtures.sql"],
  },
  {
    kind: "script",
    id: "e2e-shipping-and-final-inspection",
    title: "最終検査（出荷前検査工程）と 指示書 → 出荷書",
    feature: REGRESSION,
    script: "e2e-shipping-and-final-inspection.ts",
    fixtures: ["e2e-fixtures.sql"],
  },
  {
    kind: "script",
    id: "e2e-inspection-and-material",
    title: "指示書 — 使用素材のプリフィルと検査表の割当ポップアップ",
    feature: REGRESSION,
    script: "e2e-inspection-and-material.ts",
  },
  {
    kind: "script",
    id: "e2e-process-step-types",
    title: "工程マスタ — 使える指示書種別が指示書ビルダーに効く",
    feature: REGRESSION,
    script: "e2e-process-step-types.ts",
  },
  {
    kind: "script",
    id: "e2e-billing-closing-dry-run",
    title: "締日処理 — 実行は今日まで・試算は未来日も",
    feature: REGRESSION,
    script: "e2e-billing-closing-dry-run.ts",
  },
  {
    kind: "script",
    id: "e2e-billing-closing-date-picker",
    title: "締日処理 — 実行モーダルの日付選択",
    feature: REGRESSION,
    script: "e2e-billing-closing-date-picker.ts",
  },
  {
    kind: "script",
    id: "e2e-kiosk-inspection-approval",
    title: "共有端末 — 検査承認",
    feature: REGRESSION,
    script: "e2e-kiosk-inspection-approval.ts",
    fixtures: ["e2e-kiosk-fixtures.sql"],
    kiosk: true,
  },
  {
    kind: "script",
    id: "e2e-url-state",
    title: "URL に載せる画面状態 — IME・フィルタ・戻る",
    feature: REGRESSION,
    script: "e2e-url-state.ts",
  },
  {
    kind: "script",
    id: "e2e-client-reads",
    title: "クライアントの読み取り — SearchSelect・F4・ファイル管理",
    feature: REGRESSION,
    script: "e2e-client-reads.ts",
  },
];

/** 仕掛品の振る舞いを、人が目で確かめる順に操作する（手順ごとに撮る）。 */
const walks: AnyScenario[] = [wipTabClassify, wipStartFromBlank, wipAbortReturn, wipAbortApproval, semiFinishedPosting];

export const inventoryScenarios: AnyScenario[] = [...walks, ...scripts];
