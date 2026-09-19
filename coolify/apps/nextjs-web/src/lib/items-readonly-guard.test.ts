/**
 * items-readonly-guard.test.ts — 統合品目マスタ（app.items）へアプリから
 * 書いていないことを見張る。
 *
 * 移行の第 1 段では items は products / materials をトリガーで写した**鏡**で、
 * 書き込みの持ち主は旧マスタのほう。ここへ直接書くと、次にその製品（素材）が
 * 編集された瞬間にトリガーが上書きして、書いたものが黙って消える —
 * 例外も出ず、画面も一度は正しく見えるので、いちばん気づきにくい壊れ方をする。
 *
 * 第 2 段（書き込みを items へ移す）でこの門は外す。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

function grep(pattern: string): string[] {
  try {
    const out = execFileSync(
      "grep",
      ["-rn", "--include=*.ts", "--include=*.tsx", pattern, SRC],
      { encoding: "utf8" },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((l) => path.relative(SRC, l).replace(/^\.\.\//, ""))
      .filter((l) => !l.startsWith("lib/items-readonly-guard.test.ts:"));
  } catch {
    return [];
  }
}

describe("旧在庫 2 表（product_inventory / material_inventory）", () => {
  it("アプリからもう触っていない（在庫は app.item_inventory に 1 本化した）", () => {
    // A-2 で書き手も読み手も item_inventory へ移した。旧 2 表はまだ DB に
    // 残っているが**中身は止まっている** — ここを読むと、動かなくなった数字を
    // 正しい在庫として出してしまう。落とすのは次の PR なので、それまでの門。
    const uses = [
      ...grep("prisma\\.productInventory\\."),
      ...grep("prisma\\.materialInventory\\."),
      ...grep("tx\\.productInventory\\."),
      ...grep("tx\\.materialInventory\\."),
    ];
    expect(uses).toEqual([]);
  });
});

describe("統合品目マスタ（app.items）", () => {
  it("アプリから書き込んでいない（鏡なので、書いてもトリガーに消される）", () => {
    const writes = [
      ...grep("prisma\\.item\\.create"),
      ...grep("prisma\\.item\\.update"),
      ...grep("prisma\\.item\\.upsert"),
      ...grep("prisma\\.item\\.delete"),
      ...grep("prisma\\.item\\.createMany"),
      ...grep("prisma\\.item\\.updateMany"),
      ...grep("tx\\.item\\.create"),
      ...grep("tx\\.item\\.update"),
      ...grep("tx\\.item\\.upsert"),
      ...grep("tx\\.item\\.delete"),
    ];
    expect(writes).toEqual([]);
  });
});
