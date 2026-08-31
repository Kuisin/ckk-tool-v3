/**
 * display-db.test.ts — 「ディスプレイは読むだけ」を実際に確かめる。
 *
 * 型で止まる（書き込みメソッドが存在しない）のが第一の守りだが、型は
 * ビルド時にしか効かない。**実物のオブジェクトにも書き込み口が生えていない**
 * ことをここで固定しておく — 将来 readOnly() の実装を触ったときに、
 * うっかり全メソッドを通す形へ戻したら落ちる。
 */

import { describe, expect, it } from "vitest";
import { displayDb } from "./display-db";

const WRITE_OPERATIONS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
  "executeRaw",
  "queryRaw",
] as const;

const READ_OPERATIONS = [
  "findMany",
  "findUnique",
  "findFirst",
  "count",
  "aggregate",
  "groupBy",
] as const;

const models = Object.keys(displayDb) as Array<keyof typeof displayDb>;

describe("displayDb — 読み取り専用ファサード", () => {
  it("表が 1 つ以上登録されている", () => {
    expect(models.length).toBeGreaterThan(0);
  });

  it.each(models)("%s に書き込みメソッドが生えていない", (model) => {
    const delegate = displayDb[model] as unknown as Record<string, unknown>;
    for (const op of WRITE_OPERATIONS) {
      expect(
        delegate[op],
        `displayDb.${String(model)}.${op} が存在する — 読み取り専用が壊れている`,
      ).toBeUndefined();
    }
  });

  it.each(models)("%s は読み取りメソッドを持つ", (model) => {
    const delegate = displayDb[model] as unknown as Record<string, unknown>;
    for (const op of READ_OPERATIONS) {
      expect(typeof delegate[op]).toBe("function");
    }
  });

  it("個人データの表を公開していない", () => {
    // 壁に映してよい情報ではないし、映す理由も無い。将来ここへ足したく
    // なったときは、まず「本当に画面に出すのか」を疑うこと。
    const forbidden = [
      "user",
      "users",
      "loginAttempt",
      "kioskCard",
      "kioskSession",
      "kioskDevice",
      "userDevice",
      "employeeDirectory",
      "portalAccount",
    ];
    for (const name of forbidden) {
      expect(
        Object.hasOwn(displayDb, name),
        `displayDb に ${name} が入っている`,
      ).toBe(false);
    }
  });

  it("プロパティに触れただけでは DB へ接続しない", () => {
    // prisma は遅延プロキシで、触った瞬間にクライアントを作る。
    // ここで接続が起きると `next build`（DATABASE_URL 無し）が落ちる。
    expect(() => Object.keys(displayDb)).not.toThrow();
    expect(() => typeof displayDb.workOrder.findMany).not.toThrow();
  });
});
