/**
 * 日付だけの列（@db.Date）へ JST の 0 時を書かない。
 *
 * `new Date("2026-11-26T00:00:00+09:00")` は UTC では 11/25 15:00 で、
 * @prisma/adapter-pg は DATE を UTC の成分から作るので、**選んだ日の 1 日前**が
 * 保存される（作業計画の日付で実際に起きていた — 画面で 11/26 を選ぶと 11/25 が
 * 入り、作業場所一覧では「持ち越し」に並んだ）。日付だけの値は
 * `T00:00:00.000Z` で渡す。時刻つきの値（plannedStartAt など）は別で、
 * そちらは JST のオフセットを付けるのが正しい。
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("日付だけの列への書き込み", () => {
  it("JST の 0 時（T00:00:00+09:00）で Date を作っていない", () => {
    const root = join(import.meta.dirname, "..");
    const hits = sources(root).filter((p) =>
      readFileSync(p, "utf8").includes("T00:00:00+09:00"),
    );
    expect(hits.map((p) => p.slice(root.length + 1))).toEqual([]);
  });
});
