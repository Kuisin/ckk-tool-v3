/**
 * items-readonly-guard.test.ts — 統合品目マスタ（app.items）まわりの門。
 *
 * ## 門が 3 回ぶん形を変えている
 *
 * 第 1 段では items は products / materials の**鏡**だったので「アプリから
 * items へ書くな」。第 3 段の前半では製品・素材マスタが items の書き手に
 * なったので「items へ書いてよいのはその 2 画面だけ（旧行も揃えるから）」。
 * 旧マスタを落としたいまは、揃える相手がもう無い。
 *
 * ## いま見張るもの — **旧マスタへの参照が 1 つも無いこと**
 *
 * `products` / `materials` / `product_inventory` / `material_inventory` は
 * DB から消えた（移行 20261102090000）。Prisma のモデルも消したので、
 * `prisma.product.*` と書けば **tsc が止める** — だからこの門は型で止まらない
 * 形だけを見る:
 *
 *   * 生 SQL（`$queryRaw` / `$executeRaw` の中の表名）— 文字列なので型は無い
 *   * 旧 id を前提にした URL（`/master/products/legacy/…`）
 *   * 書き込みの橋（`lib/item-legacy-*.ts`）の復活
 *
 * ★ **門は落ちられなければ意味が無い。** grep が 0 件を返すだけの
 *   テストは、対象が消えたのか grep が壊れたのか区別できない。だから
 *   「この grep は実在する文字列を見つけられる」ことを毎回確かめる
 *   （下の「grep 自体が生きている」）。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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

describe("grep 自体が生きている", () => {
  it("実在する文字列は見つかる（0 件しか返せない門を作らない）", () => {
    // `prisma.item.` は必ずどこかにある（品目マスタを読まない画面は無い）。
    expect(grep("prisma\\.item\\.").length).toBeGreaterThan(0);
  });
});

describe("旧マスタ（products / materials）", () => {
  it("Prisma のモデルが消えている（型で止まる状態になっている）", () => {
    // ここが残っていると tsc は通ってしまい、下の grep だけが頼りになる。
    const schema = path.resolve(__dirname, "../../prisma/schema/master.prisma");
    const src = execFileSync("cat", [schema], { encoding: "utf8" });
    expect(src).not.toMatch(/^model Product \{/m);
    expect(src).not.toMatch(/^model Material \{/m);
  });

  it("生 SQL からも参照していない（文字列なので型では止まらない）", () => {
    const uses = [
      ...grep("app\\.products\\b"),
      ...grep("app\\.materials\\b"),
      ...grep("app\\.product_inventory\\b"),
      ...grep("app\\.material_inventory\\b"),
    ];
    expect(uses).toEqual([]);
  });

  it("旧在庫 2 表を Prisma 経由で触っていない", () => {
    const uses = [
      ...grep("prisma\\.productInventory\\."),
      ...grep("prisma\\.materialInventory\\."),
      ...grep("tx\\.productInventory\\."),
      ...grep("tx\\.materialInventory\\."),
      ...grep("prisma\\.product\\."),
      ...grep("prisma\\.material\\."),
      ...grep("tx\\.product\\."),
      ...grep("tx\\.material\\."),
    ];
    expect(uses).toEqual([]);
  });
});

describe("書き込みの橋（lib/item-legacy-*.ts）", () => {
  it("ファイルごと消えている", () => {
    expect(existsSync(path.join(SRC, "lib/item-legacy-product.ts"))).toBe(
      false,
    );
    expect(existsSync(path.join(SRC, "lib/item-legacy-material.ts"))).toBe(
      false,
    );
  });

  it("誰も import していない", () => {
    expect(grep("item-legacy-")).toEqual([]);
  });
});

describe("旧 id の入口（/master/{products,materials}/legacy/…）", () => {
  it("転送ページが消えている", () => {
    // 監査ログ・CM02 の保存済み回答が持っていた旧 id は、移行
    // 20261102090000 / 20261101090000 が品目 id へ読み替えた。転送ページは
    // 役目を終えている — 残すと「旧 id でも開ける」ように見えて、実際は
    // 別の品目が開く（どちらも連番なので必ず何かに当たる）。
    expect(
      existsSync(path.join(SRC, "app/(dashboard)/master/products/legacy")),
    ).toBe(false);
    expect(
      existsSync(path.join(SRC, "app/(dashboard)/master/materials/legacy")),
    ).toBe(false);
  });

  it("どこからもリンクしていない", () => {
    const uses = [
      ...grep("/master/products/legacy"),
      ...grep("/master/materials/legacy"),
    ];
    expect(uses).toEqual([]);
  });
});
