/**
 * inventory-custody-scope.test.ts — **預け在庫を自社在庫として数えていないか**を
 * 全クエリで検査する。
 *
 * `app.item_inventory` は自社の在庫と、外注に預けている在庫（`custody_bp_id`
 * 付き）と、顧客から預かっている在庫（`owner_bp_id` 付き — 再研磨の工具）を
 * 同じ表に持つ。分けているのはバケットの鍵だけで、**絞り忘れると
 * 預けている物・預かっている物が手持ちとして数えられる** — 在庫一覧の合計が
 * 増え、引当が通り、最悪、社外にある品や顧客の物が出荷できてしまう。型では
 * 止まらない（列を書かないのが既定の意味になる）ので、ここで止める。
 *
 * 3 つめの軸は**仕掛品**（`wip_state_id` 付き — 途中まで加工した品）。完成して
 * いないので製品・素材の手持ちに数えてはいけない（下の WIP_AXIS）。
 *
 * 軸ごとに規則はどちらか:
 *   1. クエリのどこかにその軸の列名（`custodyBpId` / `ownerBpId`）が出てくる
 *      （自社だけに絞る / 預け・預り品だけを読む / 画面側で分ける、のいずれかを
 *      明示している）
 *   2. 直前にその軸のコメント（`custody-scope:` / `owner-scope:`）で理由を
 *      書いてある（id 指定で 1 行を引くだけ、など絞る意味が無い場合）
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

interface Axis {
  /** where 句に出てくれば「自社か否かを言っている」とみなす列名。 */
  token: string;
  /** 直前 500 文字にあれば免除するコメントの印。 */
  comment: string;
}

const CUSTODY_AXIS: Axis = { token: "custodyBpId", comment: "custody-scope:" };
const OWNER_AXIS: Axis = { token: "ownerBpId", comment: "owner-scope:" };
/**
 * 仕掛品（加工状態を持つ行）の軸。仕掛品は完成していない品で、製品・素材の
 * 手持ち・引当・出荷に数えてはいけない。**品目で絞るだけでは足りない** —
 * 加工状態を推定できなかった「未分類」の仕掛品は製品の品目のまま残っている。
 * 印は `wipStateId` だけ（旧 is_semi_finished は Prisma では @ignore —
 * Client からは見えない廃止予定の列）。
 */
const WIP_AXIS: Axis = { token: "wipStateId", comment: "wip-scope:" };

function findOffenders(axis: Axis): Offender[] {
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
        // 理由のコメントは where 句の中（絞る条件のすぐ横）に書いてもよい。
        const exempt =
          call.includes(axis.token) ||
          call.includes(axis.comment) ||
          before.includes(axis.comment);
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
    expect(findOffenders(CUSTODY_AXIS)).toEqual([]);
  });

  it("item_inventory を探しに行くクエリは、自社か顧客の預り品かを必ず言っている", () => {
    expect(findOffenders(OWNER_AXIS)).toEqual([]);
  });

  it("item_inventory を探しに行くクエリは、仕掛品を含むか否かを必ず言っている", () => {
    expect(findOffenders(WIP_AXIS)).toEqual([]);
  });

  it("仕掛品の軸: 製品の手持ちを数える主要なクエリが実際に絞っている", () => {
    // 規則 2（コメントでの免除）に逃げていないことを、数える側の代表で固定する。
    for (const file of [
      "src/lib/atp.ts",
      "src/app/(dashboard)/shipping/delivery-orders/actions.ts",
      "src/app/(dashboard)/inventory/requirements/data.ts",
      "src/app/api/v1/inventory/materials/route.ts",
    ]) {
      expect(fs.readFileSync(file, "utf8")).toContain("wipStateId: null");
    }
    const inventory = fs.readFileSync("src/lib/inventory.ts", "utf8");
    // 出荷（planDispatchLines）・引当（reserveProductStock）・外注戻し
    expect(inventory.match(/wipStateId: null/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    // 引当の行ロック（生 SQL）も同じ範囲
    expect(inventory).toContain("AND wip_state_id IS NULL");
  });
});
