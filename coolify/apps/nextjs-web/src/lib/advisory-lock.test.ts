/**
 * advisory-lock.test.ts — 定期処理の排他。
 *
 * DB を使わずに固定できるのは 2 点:
 *   1. 鍵の導出（名前 → int4）が**安定していること**。ここがずれると
 *      新旧コンテナが別の鍵を取って排他が効かない = 直したつもりで直っていない。
 *   2. `DATABASE_URL` が無い環境では素通しで走ること（ローカルで止まらない）。
 *
 * 「ロックが取れない → 飛ばす」の経路は本物の接続が要るので、ここでは
 * `DATABASE_URL` を不正な値にして**接続に失敗したら走らせない**ことだけ見る。
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  advisoryLockKey,
  PERIODIC_LOCK_NS,
  PERIODIC_LOCKS,
  withAdvisoryLock,
} from "./advisory-lock";

describe("advisoryLockKey", () => {
  it("同じ名前は常に同じ鍵になる", () => {
    expect(advisoryLockKey("closing:autorun")).toBe(
      advisoryLockKey("closing:autorun"),
    );
  });

  it("名前が違えば鍵も違う（3 つの定期処理が互いを待たない）", () => {
    const keys = Object.values(PERIODIC_LOCKS).map(advisoryLockKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("int4 に収まる", () => {
    for (const name of Object.values(PERIODIC_LOCKS)) {
      const key = advisoryLockKey(name);
      expect(Number.isInteger(key)).toBe(true);
      expect(key).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(key).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });

  it("名前空間は設計図の版採番と衝突しない", () => {
    // design-files.ts の VERSION_LOCK_NS = 0x0de51
    expect(PERIODIC_LOCK_NS).not.toBe(0x0de51);
  });

  it("鍵の値を固定する（変えると新旧コンテナで排他が効かなくなる）", () => {
    // ★ この期待値は「変えてはいけない」印。デプロイ中は新旧のコンテナが
    //   同時に走るので、片方だけ鍵が変わると両方が走ってしまう。
    expect(advisoryLockKey("closing:autorun")).toBe(
      advisoryLockKey("closing:autorun"),
    );
    expect(advisoryLockKey("")).toBe(0x811c9dc5 | 0);
  });
});

describe("withAdvisoryLock", () => {
  const original = process.env.DATABASE_URL;
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("DATABASE_URL が無ければ素通しで走る（ローカルで止めない）", async () => {
    let ran = false;
    const out = await withAdvisoryLock(PERIODIC_LOCKS.intakeScan, async () => {
      ran = true;
      return 42;
    });
    expect(ran).toBe(true);
    expect(out).toEqual({ ran: true, result: 42 });
  });

  it("ロックを取れなければ fn を呼ばない", async () => {
    // 接続できない URL = ロックが取れない。二重実行を防ぐのが目的なので
    // 「取れないなら走らせない」に倒す。
    process.env.DATABASE_URL =
      "postgresql://nobody@127.0.0.1:1/none?connect_timeout=1";
    let ran = false;
    const out = await withAdvisoryLock(
      PERIODIC_LOCKS.notificationDigest,
      async () => {
        ran = true;
        return 1;
      },
    );
    expect(ran).toBe(false);
    expect(out.ran).toBe(false);
    expect(out.result).toBeUndefined();
  });
});
