import { describe, expect, it } from "vitest";
import {
  allocateFromBuckets,
  bucketAvailable,
  totalAvailable,
} from "./inventory-availability-core";

const bucket = (id: string, quantity: number, reservedQuantity = 0) => ({
  id,
  quantity,
  reservedQuantity,
});

describe("bucketAvailable", () => {
  it("予約が無ければ在庫数がそのまま引ける", () => {
    expect(bucketAvailable(bucket("a", 10))).toBe(10);
  });

  it("**他の明細**の予約は引けない（これが今回直した本体）", () => {
    // 10 本あるが 6 本は別の注文明細が押さえている → 引けるのは 4 本
    expect(bucketAvailable(bucket("a", 10, 6))).toBe(4);
  });

  it("自分の明細の予約は引ける（自分の予約に自分で阻まれない）", () => {
    expect(bucketAvailable(bucket("a", 10, 6), 6)).toBe(10);
  });

  it("自分の予約を足しても実在庫は超えない", () => {
    // 予約の集計が実在庫より大きい壊れたデータでも、在庫以上は出さない
    expect(bucketAvailable(bucket("a", 10, 2), 99)).toBe(10);
  });

  it("予約が在庫を超えていても負にならない", () => {
    expect(bucketAvailable(bucket("a", 5, 8))).toBe(0);
  });
});

describe("totalAvailable", () => {
  it("バケットを跨いで合計する", () => {
    const buckets = [bucket("a", 10, 6), bucket("b", 4)];
    expect(totalAvailable(buckets)).toBe(8); // 4 + 4
    expect(totalAvailable(buckets, new Map([["a", 6]]))).toBe(14); // 10 + 4
  });
});

describe("allocateFromBuckets", () => {
  it("残量のあるバケットから順に取る", () => {
    const buckets = [bucket("a", 6), bucket("b", 5)];
    expect(allocateFromBuckets(buckets, 8)).toEqual({
      steps: [
        { bucketId: "a", take: 6 },
        { bucketId: "b", take: 2 },
      ],
      shortfall: 0,
    });
  });

  it("他明細の予約ぶんは飛ばす — 予約を食って出荷しない", () => {
    // 合計 10 本あるが、a の 8 本は別明細の引当。引けるのは 2 + 3 = 5 本
    const buckets = [bucket("a", 8, 8), bucket("b", 3)];
    const r = allocateFromBuckets(buckets, 5);
    expect(r.steps).toEqual([{ bucketId: "b", take: 3 }]);
    expect(r.shortfall).toBe(2);
  });

  it("自分の予約ぶんは使える（在庫手配した明細は出荷できる）", () => {
    const buckets = [bucket("a", 8, 8)];
    const r = allocateFromBuckets(buckets, 8, new Map([["a", 8]]));
    expect(r).toEqual({ steps: [{ bucketId: "a", take: 8 }], shortfall: 0 });
  });

  it("自分の予約は自分ぶんだけ — 同バケットの他人の予約は残す", () => {
    // 10 本中 8 本予約、うち自分は 3 本 → 引けるのは 2 + 3 = 5 本
    const r = allocateFromBuckets([bucket("a", 10, 8)], 6, new Map([["a", 3]]));
    expect(r.steps).toEqual([{ bucketId: "a", take: 5 }]);
    expect(r.shortfall).toBe(1);
  });

  it("足りなければ shortfall を返す（呼び出し側が 1 件も出庫せずに失敗させる）", () => {
    expect(allocateFromBuckets([bucket("a", 2)], 5).shortfall).toBe(3);
  });

  it("要求 0 なら何も取らない", () => {
    expect(allocateFromBuckets([bucket("a", 5)], 0)).toEqual({
      steps: [],
      shortfall: 0,
    });
  });

  it("空在庫は全量不足", () => {
    expect(allocateFromBuckets([], 4)).toEqual({ steps: [], shortfall: 4 });
  });
});
