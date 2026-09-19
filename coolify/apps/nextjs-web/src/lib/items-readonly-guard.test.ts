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

describe("統合在庫（app.item_inventory）", () => {
  it("アプリから書き込んでいない（A-2 までは鏡なので、書いても消される）", () => {
    const writes = [
      ...grep("prisma\\.itemInventory\\.create"),
      ...grep("prisma\\.itemInventory\\.update"),
      ...grep("prisma\\.itemInventory\\.upsert"),
      ...grep("prisma\\.itemInventory\\.delete"),
      ...grep("tx\\.itemInventory\\.create"),
      ...grep("tx\\.itemInventory\\.update"),
      ...grep("tx\\.itemInventory\\.upsert"),
      ...grep("tx\\.itemInventory\\.delete"),
    ];
    expect(writes).toEqual([]);
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
