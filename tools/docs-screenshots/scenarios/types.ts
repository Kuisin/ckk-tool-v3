/**
 * types.ts — 機能ごとの通し確認（シナリオ）の型。
 *
 * ウォークスルー（walkthroughs/）が「業務の流れ 1 本 = マニュアルの 1 ページ」なのに
 * 対して、シナリオは「**1 つの機能が、実際の画面でそう動くこと**」を確かめる。
 * 違いは 3 つ:
 *
 *   1. **手順ごとに画面を撮って残す**（人と AI が後から目で確かめるため）。
 *      合否だけでは「通ったが見た目がおかしい」を拾えない。
 *   2. **1 本ごとに、シード直後の DB を複製して使う**。互いに独立なので並列に走らせ
 *      られ、何度流しても同じ結果になる（scripts/scenarios.ts）。
 *   3. 画面の裏（台帳・採番）を SQL で確かめてよい（`s.sql`）。動画ではないので、
 *      準備を fixtures の SQL で済ませてもよい。
 */

import type { WalkUser } from "../walkthroughs/types";
import type { Scn } from "./scn";

export interface ScenarioStep {
  /** この手順で何をして、何を確かめるか（レポートの見出しになる）。 */
  caption: string;
  run: (s: Scn) => Promise<void>;
}

interface ScenarioBase {
  /** 出力フォルダ名・`--only` の指定に使う（kebab-case）。 */
  id: string;
  /** レポートの題。 */
  title: string;
  /**
   * 何の機能の確認か。レポートはこれで束ねる。
   * 例: "A 印字通し番号 (#974)"
   */
  feature: string;
  /**
   * この 1 本の DB にだけ流す SQL（tools/docs-screenshots からの相対パス）。
   * アプリを起動する前に流す。
   */
  fixtures?: string[];
  /** 共有端末アプリ（nextjs-kiosk）も起動する。`s.kioskUrl` / `s.openKiosk()`。 */
  kiosk?: boolean;
  /** PDF を実際に描く（Gotenberg を起動して GOTENBERG_URL を渡す）。`s.pdf()`。 */
  pdf?: boolean;
  /**
   * ファイルの保存先（SeaweedFS）を、メモリだけの Filer もどきで用意して
   * SEAWEED_FILER_URL を渡す（画像のアップロード → PDF に刷る、を通しで確かめる）。
   * 無ければ保存先は無い — アップロードは失敗し、生成済み PDF は保存されない。
   */
  storage?: boolean;
}

/** 画面を操作する 1 本（scenarios.spec.ts が走らせる）。 */
export interface Scenario extends ScenarioBase {
  kind?: "walk";
  /** 最初にログインしているユーザー。既定 staff（demo2）。 */
  user?: WalkUser;
  steps: ScenarioStep[];
}

/**
 * 既存の e2e-*.ts をそのまま 1 本として走らせる。
 * 標準出力の `PASS  名前` / `FAIL  名前  → 実測値` を合否として拾い、
 * SHOT_DIR に書かれた画像をレポートに載せる。
 */
export interface ScriptScenario extends ScenarioBase {
  kind: "script";
  /** tools/docs-screenshots からの相対パス。 */
  script: string;
}

export type AnyScenario = Scenario | ScriptScenario;

// ── 結果（<out>/<id>/result.json）────────────────────────────────────────────

export interface CheckResult {
  name: string;
  ok: boolean;
  /** 実測値（落ちたとき何が起きたかを読むため。通ったときも残す）。 */
  actual?: string;
}

export interface ShotResult {
  /** <out>/<id>/ からの相対パス。 */
  file: string;
  label: string;
}

export interface StepResult {
  no: number;
  caption: string;
  status: "pass" | "fail" | "skipped";
  /** 手順が例外で止まったときの文。 */
  error?: string;
  /** 手順が終わったときの URL。 */
  url?: string;
  durationMs: number;
  checks: CheckResult[];
  shots: ShotResult[];
}

export interface ScenarioResult {
  id: string;
  title: string;
  feature: string;
  kind: "walk" | "script";
  status: "pass" | "fail";
  startedAt: string;
  durationMs: number;
  steps: StepResult[];
  /** 手順の外で拾った問題（未捕捉例外・console.error）。 */
  problems: string[];
  /** script のときの標準出力（末尾）。 */
  log?: string;
}
