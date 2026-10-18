/**
 * step-cancel-scope.test.ts — **進行中の工程を倒すときセッションを畳んでいるか**。
 *
 * 工程を CANCELLED にしてしまうと、open な作業セッションを閉じられる経路が
 * 1 つも無くなる — pause / complete / abort はどれも `IN_PROGRESS` を要求し、
 * 実績行の削除も完了・キャンセル済みの工程では拒否される。そのまま残すと:
 *
 *   * `work_order_step_actuals.ended_at IS NULL` の行が永久に残り、
 *     `accumulatedWorkMs` は open な行を「今も動いている」と数えるので
 *     **キャンセル済みの工程の作業時間が増え続ける**
 *   * `session_locked_by` が誰のものでもない保持者として残る
 *     （強制解除の口は cron も画面も無い — grep 済み）
 *
 * 型では止まらない（列を書かないのが既定の意味になる）ので、ここで止める。
 * **PENDING だけを倒す書き込みは対象外** — 未着手の工程はロックも実績も
 * 持たないため（全量返却で下流を畳む `workflow.ts` がそれ）。
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
        out.push(p);
    }
  };
  walk(root);
  return out;
}

/** 進行中を含めて CANCELLED に倒していて、ロックを外していない書き込み。 */
function offenders(): string[] {
  const bad: string[] = [];
  for (const file of sourceFiles("src")) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("workOrderStep.")) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        (node.expression.name.text === "updateMany" ||
          node.expression.name.text === "update") &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "workOrderStep"
      ) {
        const call = node.getText();
        const cancels = /status:\s*"CANCELLED"/.test(call);
        const touchesInProgress = call.includes('"IN_PROGRESS"');
        if (cancels && touchesInProgress && !call.includes("sessionLockedBy")) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          bad.push(`${file}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return bad;
}

describe("工程のキャンセルと作業セッション", () => {
  it("走査そのものが空振りしていない", () => {
    // 見つからなくなったら規則が消えたのではなく、探し方が壊れている。
    const text = fs.readFileSync("src/lib/order-line-cancel.ts", "utf8");
    expect(text).toContain("workOrderStep.updateMany");
  });

  it("進行中を含めて倒す書き込みは、必ずセッションロックも外している", () => {
    expect(offenders()).toEqual([]);
  });

  it("連鎖キャンセルは、工程を倒す**前**に open な実績行を閉じている", () => {
    // 順序が逆だと閉じられない（CANCELLED になった工程の実績行は、どの経路
    // からも触れなくなる）。文字位置で順序を見る。
    const text = fs.readFileSync("src/lib/order-line-cancel.ts", "utf8");
    const closeActuals = text.indexOf("workOrderStepActual.updateMany");
    // **工程**の書き込みと比べる。`status: "CANCELLED"` を素で探すと、先に
    // 出てくる注文明細自身のキャンセルに当たってしまう（"workOrderStep." は
    // 直後がドットなので "workOrderStepActual." には当たらない）。
    const cancelSteps = text.indexOf("workOrderStep.updateMany");
    expect(closeActuals).toBeGreaterThan(-1);
    expect(cancelSteps).toBeGreaterThan(-1);
    expect(closeActuals).toBeLessThan(cancelSteps);
  });

  it("連鎖キャンセルは指示書スコープの予約も解放している", () => {
    // 明細スコープ（releaseOrderLineReservations）だけでは、承認時に指示書へ
    // 付いた素材予約が RESERVED のまま残る。cancelWorkOrder は両方やっている。
    const text = fs.readFileSync("src/lib/order-line-cancel.ts", "utf8");
    expect(text).toContain("releaseWorkOrderReservations");
  });
});
