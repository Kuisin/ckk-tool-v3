/**
 * inventory-custody-scope.test.ts — **預け在庫を自社在庫として数えていないか**を
 * 全クエリで検査する。
 *
 * `app.item_inventory` は自社の在庫と、外注に預けている在庫（`custody_bp_id`
 * 付き）を同じ表に持つ。分けているのはバケットの鍵だけで、**絞り忘れると
 * 預けている物が手持ちとして数えられる** — 在庫一覧の合計が増え、引当が通り、
 * 最悪、社外にある品が出荷できてしまう。型では止まらない（列を書かないのが
 * 既定の意味になる）ので、ここで止める。
 *
 * 規則はどちらか:
 *   1. クエリのどこかに `custodyBpId` が出てくる（自社だけに絞る / 預けだけを
 *      読む / 画面側で分ける、のいずれかを明示している）
 *   2. 直前に `custody-scope:` のコメントで理由を書いてある（id 指定で 1 行を
 *      引くだけ、など絞る意味が無い場合）
 *
 * キオスク側は `inventory.ts` の twin しか item_inventory を触らないので、
 * ここ（原本）を見れば足りる。
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** 行を「探しに行く」クエリ。id 指定の 1 行取得は対象外にしない（規則 2 で書く）。 */
const METHODS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "aggregate",
  "groupBy",
  "count",
  "updateMany",
  "deleteMany",
]);

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

interface Offender {
  where: string;
  method: string;
}

function findOffenders(): Offender[] {
  const offenders: Offender[] = [];
  for (const file of sourceFiles("src")) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("itemInventory.")) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        METHODS.has(node.expression.name.text) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "itemInventory"
      ) {
        const call = node.getText();
        const start = node.getStart();
        // 直前 500 文字に書かれた免除の理由（コメント）。
        const before = text.slice(Math.max(0, start - 500), start);
        const exempt =
          call.includes("custodyBpId") || before.includes("custody-scope:");
        if (!exempt) {
          const { line } = sf.getLineAndCharacterOfPosition(start);
          offenders.push({
            where: `${file}:${line + 1}`,
            method: node.expression.name.text,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return offenders;
}

describe("預け在庫（外注が持っている分）の絞り込み", () => {
  it("走査そのものが空振りしていない", () => {
    // 見つからなくなったら規則が消えたのではなく、探し方が壊れている。
    const text = fs.readFileSync("src/lib/inventory.ts", "utf8");
    expect(text).toContain("itemInventory.findMany");
  });

  it("item_inventory を探しに行くクエリは、自社か預けかを必ず言っている", () => {
    expect(findOffenders()).toEqual([]);
  });
});
