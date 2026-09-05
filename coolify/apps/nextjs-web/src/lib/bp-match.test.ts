import { describe, expect, it } from "vitest";
import {
  type BpMatchable,
  bpMatchKey,
  matchBusinessPartnerName,
} from "./bp-match";

/**
 * 実データ（dev の app.business_partners）から取った形。
 * 「登録されている表記」と「書類に印字される表記」がずれる典型を並べている。
 */
const bp = (
  id: string,
  label: string,
  matchNames: string[],
  matchNamesAuto: string[] = [],
): BpMatchable => ({
  id,
  label,
  nameJa: label,
  matchNames,
  matchNamesAuto,
  hasExpectedRole: true,
});

const POOL: BpMatchable[] = [
  bp(
    "kurata",
    "株式会社クラタ",
    ["株式会社クラタ", "クラタ", "クラタ株式会社", "クラタ(株)", "クラタ㈱"],
    ["クラタ", "くらた", "kurata"],
  ),
  bp(
    "musashi",
    "武蔵精密工業",
    ["武蔵精密工業", "武蔵精密工業(株）"],
    ["ムサシセイミツコウギョウ", "むさしせいみつこうぎょう"],
  ),
  bp("minoru", "㈱稔産業", [
    "㈱稔産業",
    "(株)稔産業",
    "稔産業",
    "稔産業株式会社",
  ]),
  bp("btt", "ビーティーティー株式会社(アライド）", [
    "ビーティーティｰ株式会社(アライド）",
    "ビーティーティー(アライド)",
  ]),
  bp(
    "jtekt-toyohashi",
    "ジェイテクト豊橋",
    ["ジェイテクト豊橋"],
    ["ジェイテクトトヨハシ"],
  ),
  bp("jtekt", "株式会社ジェイテクト", ["株式会社ジェイテクト", "ジェイテクト"]),
  bp("seimitsu", "精密工業株式会社", ["精密工業株式会社"]),
];

const matchId = (read: string) =>
  matchBusinessPartnerName(read, POOL).matched?.id ?? null;

describe("bpMatchKey", () => {
  it("全角・記号・空白・かなの違いを同じ鍵にする", () => {
    expect(bpMatchKey("ＴＨＫ (株)")).toBe(bpMatchKey("thk(株)"));
    expect(bpMatchKey("くらた")).toBe(bpMatchKey("クラタ"));
    expect(bpMatchKey("ビーティーティｰ")).toBe(bpMatchKey("ビーティーティー"));
    expect(bpMatchKey("㈱稔産業")).toBe(bpMatchKey("(株) 稔産業"));
  });
});

describe("matchBusinessPartnerName", () => {
  it("完全一致（従来どおり引ける）", () => {
    expect(matchId("株式会社クラタ")).toBe("kurata");
    expect(matchId("クラタ㈱")).toBe("kurata");
  });

  it("記号・空白・全角半角のゆれを吸収する", () => {
    expect(matchId("(株) 稔産業")).toBe("minoru");
    expect(matchId("株式会社 クラタ")).toBe("kurata");
    expect(matchId("ビーティーティー株式会社（アライド）")).toBe("btt");
  });

  it("敬称が付いていても引ける", () => {
    expect(matchId("株式会社クラタ 御中")).toBe("kurata");
    expect(matchId("武蔵精密工業　様")).toBe("musashi");
  });

  it("法人格が後から付いた表記を引ける（登録は核だけ）", () => {
    expect(matchId("武蔵精密工業株式会社")).toBe("musashi");
    // 法人格の前後は問わない。
    expect(matchId("株式会社武蔵精密工業")).toBe("musashi");
  });

  it("途中に含まれるだけの別会社を掴まない", () => {
    // 「武蔵精密工業株式会社」には「精密工業株式会社」が含まれるが、頭から
    // ではないので別会社。ここを許すと長い方が勝って黙って間違える。
    expect(matchId("武蔵精密工業株式会社")).not.toBe("seimitsu");
  });

  it("支店・工場名が続いていても親の取引先を引ける", () => {
    const r = matchBusinessPartnerName("株式会社クラタ 名古屋営業所", POOL);
    expect(r.matched?.id).toBe("kurata");
    expect(r.matched?.confidence).toBe("prefix");
  });

  it("かなで印字されても自動生成の照合名で引ける", () => {
    expect(matchId("くらた")).toBe("kurata");
  });

  it("より具体的に当たった方を選ぶ", () => {
    // 「ジェイテクト」も「ジェイテクト豊橋」も含まれるが、長い方が具体的。
    expect(matchId("株式会社ジェイテクト豊橋工場")).toBe("jtekt-toyohashi");
  });

  it("略称（照合名の一部）は自動確定せず候補に留める", () => {
    const r = matchBusinessPartnerName("ジェイテク", POOL);
    expect(r.matched).toBeNull();
    expect(r.candidates.map((c) => c.id).sort()).toEqual([
      "jtekt",
      "jtekt-toyohashi",
    ]);
    expect(r.candidates[0].confidence).toBe("partial");
  });

  it("短すぎる読み取りは候補にも出さない", () => {
    // 2 文字は当たりが広すぎる（当たっても選ぶ根拠にならない）。
    expect(matchBusinessPartnerName("稔", POOL).candidates).toEqual([]);
    expect(matchBusinessPartnerName("ジェイ", POOL).matched).toBeNull();
  });

  it("絞れないときは候補を返す（黙って 1 件に決めない）", () => {
    const pool = [
      bp("a", "山田製作所", ["山田製作所"]),
      bp("b", "山田製作所", ["山田製作所"]),
    ];
    const r = matchBusinessPartnerName("山田製作所株式会社", pool);
    expect(r.matched).toBeNull();
    expect(r.candidates).toHaveLength(2);
  });

  it("期待するロールを持たない取引先は自動確定しない（候補には出す）", () => {
    const pool = [
      { ...bp("v", "仕入商事", ["仕入商事"]), hasExpectedRole: false },
    ];
    const r = matchBusinessPartnerName("仕入商事", pool);
    expect(r.matched).toBeNull();
    expect(r.candidates.map((c) => c.id)).toEqual(["v"]);
  });

  it("読み取れなかった・当たらないときは空", () => {
    expect(matchBusinessPartnerName(null, POOL)).toEqual({
      matched: null,
      candidates: [],
    });
    expect(matchBusinessPartnerName("   ", POOL)).toEqual({
      matched: null,
      candidates: [],
    });
    expect(matchBusinessPartnerName("該当なし工業", POOL)).toEqual({
      matched: null,
      candidates: [],
    });
  });
});
