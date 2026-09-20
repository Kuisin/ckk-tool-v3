/**
 * match-alias-target-guard.test.ts — `MatchAliasTarget` と DB の CHECK を揃える門。
 *
 * ## なぜこの門が要るか（実際に起きたこと）
 *
 * `app.match_aliases.target_type` には baseline 以来 CHECK
 * （`match_aliases_target_type_check`）が張ってあり、許す値を列挙している。
 * 購買側の取込 (PU02/PU03) を足したとき TS 側の union にだけ `"materials"` を
 * 足して CHECK を広げ忘れた。その結果:
 *
 *   1. 素材の学習は毎回 CHECK 違反で INSERT が落ちる
 *   2. `saveAliasLearnings` は**学習で保存を止めない**設計なので握り潰す
 *   3. 画面は正常に見える。ログにしか出ない。**素材の学習は 1 件も貯まらない**
 *
 * 「失敗しても止めない」のは正しい設計（学習は副産物で、人の作業を止める
 * 理由にならない）。だから壊れていることは**実行時には分からない**。
 * ここで型と SQL を突き合わせるのがいちばん安い見張り方になる。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MATCH_ALIAS_TARGETS } from "./match-alias-core";

const MIGRATIONS = join(
  __dirname,
  "../../../../..",
  "shared-db/prisma/migrations",
);

/**
 * `match_aliases_target_type_check` を**最後に定義した** migration の列挙を返す。
 * migration 名は時刻順に並ぶので、名前の昇順で最後に当たったものが現在の姿。
 */
function currentCheckValues(): string[] {
  let latest: string[] | null = null;
  for (const dir of readdirSync(MIGRATIONS).sort()) {
    let sql: string;
    try {
      sql = readFileSync(join(MIGRATIONS, dir, "migration.sql"), "utf-8");
    } catch {
      continue; // migration_lock.toml など
    }
    // CONSTRAINT match_aliases_target_type_check CHECK ((target_type = ANY (ARRAY[...])))
    const m = sql.match(
      /match_aliases_target_type_check[\s\S]{0,200}?ARRAY\[([\s\S]*?)\]/,
    );
    if (m) latest = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  return latest ?? [];
}

describe("match_aliases.target_type", () => {
  it("TS の union と DB の CHECK が同じ値の集合になっている", () => {
    const inSql = currentCheckValues();
    // 抽出そのものが壊れていたら（0 件）気づけるように
    expect(inSql.length).toBeGreaterThan(0);
    expect([...inSql].sort()).toEqual([...MATCH_ALIAS_TARGETS].sort());
  });

  it("旧マスタ（products / materials）はもう許されていない", () => {
    // 品目統合 第 3 段で items 1 つに畳んだ。片方だけ残すと、突合側が
    // 引けない学習を書き続ける（上のコメントと同じ壊れ方）。
    const inSql = currentCheckValues();
    expect(inSql).not.toContain("products");
    expect(inSql).not.toContain("materials");
  });
});
