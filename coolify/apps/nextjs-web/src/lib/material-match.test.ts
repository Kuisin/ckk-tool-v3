import { describe, expect, it } from "vitest";
import {
  type MaterialMatchable,
  matchMaterial,
  materialCodeKey,
} from "./material-match";

/**
 * 素材の突合。**素材を取り違えると在庫と原価の両方がずれる**ので、
 * 迷ったら決めない（候補にする）方に倒れているかを見る。
 */

const m = (
  id: string,
  code: string,
  nameJa: string,
  extra: Partial<MaterialMatchable> = {},
): MaterialMatchable => ({
  id,
  code,
  label: `${code}（${nameJa}）`,
  nameJa,
  ...extra,
});

const POOL: MaterialMatchable[] = [
  m("1", "B01A0001-A060-310", "超硬丸棒 φ6.0×310", {
    manufacturerModel: "103.70.060",
  }),
  m("2", "B01A0001-A083-330", "超硬丸棒 φ8.3×330"),
  m("3", "C01B0002-B100-400", "OH丸棒 φ10.0×400", {
    keywords: ["OHロッド"],
  }),
];

describe("materialCodeKey", () => {
  it("大文字化と空白除去だけを行う", () => {
    expect(materialCodeKey(" b01a0001-a060-310 ")).toBe("B01A0001-A060-310");
  });
});

describe("matchMaterial — 素材コード", () => {
  it("コード欄の完全一致で 1 件に決まる", () => {
    const r = matchMaterial("B01A0001-A083-330", null, POOL);
    expect(r.matched?.id).toBe("2");
    expect(r.matched?.confidence).toBe("exact");
  });

  it("大小・空白のゆれを吸収する", () => {
    expect(matchMaterial(" b01a0001-a083-330 ", null, POOL).matched?.id).toBe(
      "2",
    );
  });

  it("品名欄にコードが混ざっていても当たる（仕入先の書式）", () => {
    expect(matchMaterial(null, "C01B0002-B100-400", POOL).matched?.id).toBe(
      "3",
    );
  });

  it("**未登録のコードは黙って名前へ落ちない**（コードが違えば別物）", () => {
    // 形はコードだがマスタに無い → コード段では決まらず、名前も無いので空。
    const r = matchMaterial("B01A0001-A099-999", null, POOL);
    expect(r.matched).toBeNull();
    expect(r.candidates).toEqual([]);
  });
});

describe("matchMaterial — 名称", () => {
  it("登録名そのものは当たる", () => {
    expect(matchMaterial(null, "超硬丸棒 φ6.0×310", POOL).matched?.id).toBe(
      "1",
    );
  });

  it("寸法記号のゆれを吸収する（φ / ×  の有無）", () => {
    expect(matchMaterial(null, "超硬丸棒 8.3x330", POOL).matched?.id).toBe("2");
  });

  it("キーワードでも当たる（マスタ MS06 の別名・学習した表記）", () => {
    expect(matchMaterial(null, "OHロッド", POOL).matched?.id).toBe("3");
  });

  it("メーカー型式でも当たる", () => {
    expect(matchMaterial(null, "103.70.060", POOL).matched?.id).toBe("1");
  });

  it("**共通部分だけでは決めない**（径違いを黙って掴まない）", () => {
    const r = matchMaterial(null, "超硬丸棒", POOL);
    expect(r.matched).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual(["1", "2"]);
  });

  it("短すぎる読み取りは候補も出さない", () => {
    expect(matchMaterial(null, "棒", POOL)).toEqual({
      matched: null,
      candidates: [],
    });
  });

  it("空・null は空の結果", () => {
    expect(matchMaterial(null, null, POOL)).toEqual({
      matched: null,
      candidates: [],
    });
    expect(matchMaterial("  ", "  ", POOL)).toEqual({
      matched: null,
      candidates: [],
    });
  });

  it("プールが空なら何も返さない", () => {
    expect(matchMaterial("B01A0001-A083-330", "超硬丸棒 φ8.3×330", [])).toEqual(
      { matched: null, candidates: [] },
    );
  });
});
