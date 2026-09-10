import { describe, expect, it } from "vitest";
import {
  andWhere,
  type Cursor,
  cursorWhere,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  MAX_PAGE_SIZE,
  parseLimit,
  parseSince,
  sinceWhere,
  takePage,
} from "./api-pagination-core";

const T = "2026-09-10T00:00:00.000Z";

describe("カーソルの往復", () => {
  it("id 形は往復して同じになる", () => {
    const c: Cursor = { kind: "id", t: T, id: "abc" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("doc 形は往復して同じになる", () => {
    const c: Cursor = { kind: "doc", t: T, ym: "202609", seq: 42 };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("不透明（URL に中身が透けない）", () => {
    expect(encodeCursor({ kind: "id", t: T, id: "abc" })).not.toContain("abc");
  });

  it.each([
    ["null", null],
    ["空", ""],
    ["base64 ではない", "!!!!"],
    ["JSON ではない", Buffer.from("nope").toString("base64url")],
    ["kind が無い", Buffer.from('{"t":"x"}').toString("base64url")],
    [
      "seq が整数でない",
      Buffer.from(`{"kind":"doc","t":"${T}","ym":"202609","seq":1.5}`).toString(
        "base64url",
      ),
    ],
    [
      "id が欠けている",
      Buffer.from(`{"kind":"id","t":"${T}"}`).toString("base64url"),
    ],
  ])("壊れたカーソルは null: %s", (_l, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
});

describe("parseLimit", () => {
  it("既定", () => expect(parseLimit(null)).toBe(DEFAULT_PAGE_SIZE));
  it("指定を尊重", () => expect(parseLimit("10")).toBe(10));
  it("上限で頭打ち", () => expect(parseLimit("100000")).toBe(MAX_PAGE_SIZE));
  it.each(["0", "-5", "abc"])("不正は既定: %s", (v) =>
    expect(parseLimit(v)).toBe(DEFAULT_PAGE_SIZE),
  );
});

describe("parseSince", () => {
  it("ISO を読む", () => expect(parseSince(T)?.toISOString()).toBe(T));
  it("読めない値は null", () => expect(parseSince("nope")).toBeNull());
  it("null は null", () => expect(parseSince(null)).toBeNull());
});

describe("cursorWhere — 同着を落とさない", () => {
  it("id 形: 時刻が後 OR (同時刻 かつ id が後)", () => {
    const w = cursorWhere({ kind: "id", t: T, id: "m" });
    expect(w).toEqual({
      OR: [
        { updatedAt: { gt: new Date(T) } },
        { updatedAt: new Date(T), id: { gt: "m" } },
      ],
    });
  });

  it("doc 形: 同時刻なら (yearMonth, seq) で決着する", () => {
    const w = cursorWhere({ kind: "doc", t: T, ym: "202609", seq: 7 });
    expect(w).toEqual({
      OR: [
        { updatedAt: { gt: new Date(T) } },
        {
          updatedAt: new Date(T),
          OR: [
            { yearMonth: { gt: "202609" } },
            { yearMonth: "202609", seq: { gt: 7 } },
          ],
        },
      ],
    });
  });

  it("不変の台帳では createdAt で並べられる", () => {
    const w = cursorWhere({ kind: "id", t: T, id: "m" }, "createdAt");
    expect(w).toEqual({
      OR: [
        { createdAt: { gt: new Date(T) } },
        { createdAt: new Date(T), id: { gt: "m" } },
      ],
    });
  });

  it("カーソルが無ければ制約なし", () => expect(cursorWhere(null)).toBeNull());
  it("時刻が壊れていれば null", () =>
    expect(cursorWhere({ kind: "id", t: "nope", id: "x" })).toBeNull());
});

// ★ 境界を含めるのが仕様。`>` にすると syncedAt と同時刻の行が永久に届かない。
describe("sinceWhere — 境界を含む（at-least-once）", () => {
  it("gte を使う（gt ではない）", () => {
    expect(sinceWhere(new Date(T))).toEqual({
      updatedAt: { gte: new Date(T) },
    });
  });
  it("null なら絞らない", () => expect(sinceWhere(null)).toBeNull());
});

describe("andWhere", () => {
  it("null と空は落ちる", () =>
    expect(andWhere(null, {}, undefined)).toEqual({}));
  it("1 つならそのまま", () =>
    expect(andWhere(null, { a: 1 })).toEqual({ a: 1 }));
  it("複数は AND", () =>
    expect(andWhere({ a: 1 }, { b: 2 })).toEqual({
      AND: [{ a: 1 }, { b: 2 }],
    }));
});

describe("takePage", () => {
  const toCursor = (r: { id: string; updatedAt: Date }): Cursor => ({
    kind: "id",
    t: r.updatedAt.toISOString(),
    id: r.id,
  });
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      updatedAt: new Date(T),
    }));

  it("limit+1 件あれば hasMore で、余分は返さない", () => {
    const p = takePage(rows(4), 3, toCursor);
    expect(p.data).toHaveLength(3);
    expect(p.hasMore).toBe(true);
    expect(decodeCursor(p.nextCursor)).toEqual({
      kind: "id",
      t: T,
      id: "id-2",
    });
  });

  it("ちょうどなら hasMore は false でカーソルも出さない", () => {
    const p = takePage(rows(3), 3, toCursor);
    expect(p.data).toHaveLength(3);
    expect(p.hasMore).toBe(false);
    expect(p.nextCursor).toBeNull();
  });

  it("0 件でも壊れない", () => {
    expect(takePage(rows(0), 3, toCursor)).toEqual({
      data: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  // 次ページのカーソルは**最後に返した行**を指す（返していない行を指さない）。
  it("カーソルは返した最後の行を指す", () => {
    const p = takePage(rows(10), 5, toCursor);
    expect(decodeCursor(p.nextCursor)).toEqual({
      kind: "id",
      t: T,
      id: "id-4",
    });
  });
});
