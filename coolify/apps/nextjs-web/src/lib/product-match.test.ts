import { describe, expect, it } from "vitest";
import {
  matchProductName,
  type ProductMatchable,
  productMatchKey,
  searchProbes,
} from "./product-match";

const p = (
  id: string,
  nameJa: string,
  extra: Partial<ProductMatchable> = {},
): ProductMatchable => ({ id, label: nameJa, nameJa, ...extra });

const POOL: ProductMatchable[] = [
  p("1", "OH付超硬ソリッドザグリカッター", { code: "PRD-202608-0002" }),
  p("2", "超硬ソリッドドリル", { code: "PRD-202608-0003" }),
  p("3", "超硬ソリッドドリル ロング", { legacyKey: "TK-1180-L" }),
  p("4", "テスト製品１", { code: "PRD-202608-0001" }),
];

const matchId = (read: string) =>
  matchProductName(read, POOL).matched?.id ?? null;

describe("productMatchKey", () => {
  it("寸法まわりの記号ゆれを吸収する", () => {
    expect(productMatchKey("カッター φ8.3×330")).toBe(
      productMatchKey("カッター 8.3x330"),
    );
    expect(productMatchKey("Φ12．5／40")).toBe(productMatchKey("12.5*40"));
  });

  it("数字に挟まれていない X は残す（品番の一部）", () => {
    expect(productMatchKey("XT100")).toBe("XT100");
    expect(productMatchKey("XT100")).not.toBe(productMatchKey("T100"));
  });
});

describe("matchProductName", () => {
  it("登録名そのものは当たる", () => {
    expect(matchId("OH付超硬ソリッドザグリカッター")).toBe("1");
  });

  it("寸法・仕様が後ろに続いていても当たる", () => {
    expect(matchId("OH付超硬ソリッドザグリカッター φ8.3×330")).toBe("1");
    expect(matchId("超硬ソリッドドリル　（コーティング品）")).toBe("2");
  });

  it("製品コード・旧品番でも当たる", () => {
    expect(matchId("PRD-202608-0002")).toBe("1");
    expect(matchId("TK-1180-L")).toBe("3");
  });

  it("同族の製品を短い一致で掴まない", () => {
    // 「超硬ソリッド」は 3 件に共通する語。1 件に絞れないので候補に留める
    // （ここで長い方を勝たせると、別の製品を黙って掴むことになる）。
    const r = matchProductName("超硬ソリッド", POOL);
    expect(r.matched).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("より具体的に当たった方を選ぶ", () => {
    expect(matchId("超硬ソリッドドリル ロング φ6")).toBe("3");
  });

  it("略記は候補止まり（自動確定しない）", () => {
    const r = matchProductName("ザグリカッター", POOL);
    expect(r.matched).toBeNull();
    expect(r.candidates.map((c) => c.id)).toEqual(["1"]);
    expect(r.candidates[0].confidence).toBe("partial");
  });

  it("**キーワード（MS04 の別名）でも当たる**", () => {
    // 相手の呼び方はマスタ名称と違うのが普通。名称に入れられない表記は
    // キーワード欄（products.match_names）に貯め、名称と同じ段で評価する。
    const pool = [
      ...POOL,
      p("5", "OH付超硬ソリッドリーマ", {
        keywords: ["OHリーマ", "OH REAMER"],
      }),
    ];
    expect(matchProductName("OHリーマ", pool).matched?.id).toBe("5");
    // 表記ゆれ（全角・大文字小文字）はキーワードでも吸収される。
    expect(matchProductName("ｏｈ　ｒｅａｍｅｒ", pool).matched?.id).toBe("5");
    // 寸法が後ろに続く印字も、キーワードの頭から一致で拾える。
    expect(matchProductName("OHリーマ φ8.3×330", pool).matched?.id).toBe("5");
  });

  it("当たらないときは空", () => {
    expect(matchProductName("該当なし工具", POOL)).toEqual({
      matched: null,
      candidates: [],
    });
    expect(matchProductName(null, POOL).matched).toBeNull();
  });
});

describe("searchProbes", () => {
  it("具体的な順に返す（DB を広く引かないため）", () => {
    const probes = searchProbes("OH付超硬ソリッドザグリカッター φ8.3×330");
    expect(probes[0]).toBe("OH付超硬ソリッドザグリカッター φ8.3×330");
    expect(probes[1]).toBe("OH付超硬ソリッドザグリカッター");
    // 以降は先頭スライス（長い順）。
    expect(probes[probes.length - 1]).toBe("OH付超");
    expect(new Set(probes).size).toBe(probes.length);
  });

  it("短すぎる語では引かない", () => {
    expect(searchProbes("Φ8")).toEqual(["Φ8"]);
    expect(searchProbes("   ")).toEqual([]);
  });
});
