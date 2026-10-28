/**
 * inventory-writer-guard.test.ts — 「在庫を動かせるのは applyTransaction だけ」を
 * ソースで見張る。
 *
 * この性質はこれまで**規約だけ**で守られていた（inventory.ts の冒頭コメント）。
 * 実際そうなっていることは監査で確認したが、確認した次の日に破られても誰も
 * 気づかない類の規約なので、門にしておく。
 *
 * 破られると何が起きるか: 入出庫伝票を通らない在庫の増減ができてしまい、
 * 「伝票を全部足すと在庫になる」が静かに成り立たなくなる。台帳としては
 * それが起きた瞬間に用をなさない。
 *
 * DB 側の守り（inventory_transactions.movement_id の NOT NULL）は、移行が
 * 行き渡ってからの別マイグレーションで当てる。それまではここと型検査が守る。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

/** src/ 配下を grep して "file:line" の配列を返す（ヒット無しは空配列）。 */
function grep(pattern: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rn", "--include=*.ts", "--include=*.tsx", pattern, SRC],
      { encoding: "utf8" },
    );
    return (
      out
        .split("\n")
        .filter(Boolean)
        .map((l) => path.relative(SRC, l).replace(/^\.\.\//, ""))
        // この門自身がパターンを文字列として含むので、必ず自分を除く
        .filter((l) => !l.startsWith("lib/inventory-writer-guard.test.ts:"))
    );
  } catch {
    // grep はヒット 0 件で exit 1 — 異常ではない
    return [];
  }
}

describe("在庫台帳の書き手", () => {
  it("inventoryTransaction.create は lib/inventory.ts の中にしか無い", () => {
    const hits = grep("inventoryTransaction\\.create");
    for (const hit of hits) {
      expect(hit.startsWith("lib/inventory.ts:")).toBe(true);
    }
    // 1 か所だけ（applyTransaction の中）であること
    expect(hits).toHaveLength(1);
  });

  it("数量を直接書き換える口が applyTransaction の外に無い", () => {
    // バケットの作成（quantity は既定の 0）は許す。禁止したいのは
    // quantity / reservedQuantity を動かす update 系。
    const writers = [
      ...grep("productInventory\\.update"),
      ...grep("materialInventory\\.update"),
      ...grep("productInventory\\.upsert"),
      ...grep("materialInventory\\.upsert"),
    ];
    for (const hit of writers) {
      expect(hit.startsWith("lib/inventory.ts:")).toBe(true);
    }
  });

  it("applyTransaction は伝票 id を必ず受け取る（引数を減らして呼べない）", () => {
    // 呼び出し側が第 2 引数を省いたら型検査で落ちるが、シグネチャ自体が
    // 戻されたら型検査は通ってしまうので、形をここでも押さえておく。
    const sig = grep("export async function applyTransaction");
    expect(sig).toHaveLength(1);
    const src = execFileSync(
      "sed",
      [
        "-n",
        "/^export async function applyTransaction/,/^): Promise<void> {/p",
        path.join(SRC, "lib/inventory.ts"),
      ],
      { encoding: "utf8" },
    );
    expect(src).toContain("movementId: string");
  });
});
