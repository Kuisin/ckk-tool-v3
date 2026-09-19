/**
 * items-readonly-guard.test.ts — 統合品目マスタ（app.items）まわりの門。
 *
 * ## 第 1 段の門は外した（2 つあったうちの 1 つ）
 *
 * 第 1 段では items は products / materials をトリガーで写した**鏡**で、
 * アプリからの書き込みを全面的に禁じていた。第 3 段で製品マスタ (MS04)・
 * 素材マスタ (MS06) が items の**書き手**になったので、その禁止は外れる。
 *
 * 代わりに見張るのは**書く場所**。items へ書いてよいのはこの 2 画面（と、
 * 旧行を揃える橋 `lib/item-legacy-{product,material}.ts`）だけで、他の画面が
 * 直接書くと旧 products / materials 行が置いていかれ、**同じ品目が 2 つの
 * 値を持つ**。旧マスタを落とすまでのあいだ、それは黙って起きる
 * （どちらを読むかで答えが変わるだけで、例外も出ない）。
 *
 * ★ 書く順は必ず **items → 旧マスタ**。旧マスタには BEFORE トリガー
 *   （`sync_item_from_{product,material}`）が張ってあり、旧マスタを書くと
 *   items をその内容で上書きする。逆順に書くと items へ書いた内容が
 *   古い値で潰れる。
 *
 * 旧マスタを落とす PR で、この門ごと消える。
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

/**
 * items へ書いてよい場所。**増やすときは、その画面が旧 products / materials
 * 行も同じ内容で揃えていることを確かめること**（そうでないと 2 つの値ができる）。
 */
const ITEM_WRITERS = [
  "app/(dashboard)/master/products/actions.ts",
  "app/(dashboard)/master/materials/actions.ts",
];

describe("統合品目マスタ（app.items）", () => {
  it("書いているのは製品マスタ・素材マスタの Server Action だけ", () => {
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
      ...grep("tx\\.item\\.updateMany"),
      ...grep("tx\\.item\\.deleteMany"),
    ];
    const strangers = writes.filter(
      (line) => !ITEM_WRITERS.some((w) => line.startsWith(`${w}:`)),
    );
    expect(strangers).toEqual([]);
  });

  it("その 2 つは実際に書いている（許可リストが腐っていない）", () => {
    // 許可リストだけが残って中身が空になると、この門は何も見なくなる。
    for (const writer of ITEM_WRITERS) {
      const writes = [
        ...grep("prisma\\.item\\.create"),
        ...grep("tx\\.item\\.create"),
        ...grep("tx\\.item\\.update"),
        ...grep("tx\\.item\\.updateMany"),
        ...grep("tx\\.item\\.deleteMany"),
      ].filter((line) => line.startsWith(`${writer}:`));
      expect(writes.length).toBeGreaterThan(0);
    }
  });

  it("旧マスタへの書き戻しは橋の中だけ（画面から直に旧行を作らない）", () => {
    // 旧行を作る・消すのは `lib/item-legacy-*.ts` と、その橋を呼ぶ 2 つの
    // Server Action（updateMany / deleteMany は橋に載せていない）に限る。
    const creates = [
      ...grep("tx\\.product\\.create("),
      ...grep("prisma\\.product\\.create("),
      ...grep("tx\\.material\\.create("),
      ...grep("prisma\\.material\\.create("),
    ];
    const allowed = [
      "lib/item-legacy-product.ts",
      "lib/item-legacy-material.ts",
    ];
    const strangers = creates.filter(
      (line) => !allowed.some((w) => line.startsWith(`${w}:`)),
    );
    expect(strangers).toEqual([]);
  });
});
