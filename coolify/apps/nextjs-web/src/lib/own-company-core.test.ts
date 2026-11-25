import { describe, expect, it } from "vitest";
import {
  groupByOwnCompany,
  issuerBlock,
  isValidInvoiceRegistrationNo,
  LEGACY_ISSUER,
  type OwnCompanyRecord,
  resolveIssuer,
  resolveOwnCompanyId,
} from "./own-company-core";

// マイグレーション 20261126120000_own_companies が入れる既定の法人と同じ値。
const CKK: OwnCompanyRecord = {
  id: 1,
  code: "CKK",
  name: { ja: "シー・ケィ・ケー株式会社" },
  postalCode: "475-0823",
  address: { ja: "愛知県半田市港町2丁目27番2" },
  phone: "0569-21-6187",
  fax: "0569-23-6427",
  invoiceRegistrationNo: "T1234567890123",
  sealFileId: null,
  isDefault: true,
};

const TSP: OwnCompanyRecord = {
  id: 2,
  code: "TSP",
  name: { ja: "ティーエスピー株式会社", en: "TSP Co., Ltd." },
  postalCode: null,
  address: { ja: "愛知県名古屋市" },
  phone: "052-000-0000",
  fax: null,
  invoiceRegistrationNo: "T9999999999999",
  sealFileId: null,
  isDefault: false,
};

describe("resolveIssuer", () => {
  it("拠点の法人を返す", () => {
    expect(resolveIssuer(2, [CKK, TSP])?.code).toBe("TSP");
  });
  it("拠点に法人が無ければ既定の法人", () => {
    expect(resolveIssuer(null, [CKK, TSP])?.code).toBe("CKK");
    expect(resolveIssuer(undefined, [CKK, TSP])?.code).toBe("CKK");
  });
  it("見つからない法人 id は既定へ落ちる", () => {
    expect(resolveIssuer(99, [CKK, TSP])?.code).toBe("CKK");
  });
  it("明示の既定を優先する", () => {
    expect(resolveIssuer(null, [CKK, TSP], TSP)?.code).toBe("TSP");
  });
  it("マスタが空なら null", () => {
    expect(resolveIssuer(1, [])).toBeNull();
  });
});

describe("resolveOwnCompanyId", () => {
  it("最初に見つかった候補が勝つ", () => {
    expect(resolveOwnCompanyId([null, 2, 1], 1)).toBe(2);
  });
  it("候補が無ければ既定", () => {
    expect(resolveOwnCompanyId([null, undefined], 1)).toBe(1);
    expect(resolveOwnCompanyId([], null)).toBeNull();
  });
});

describe("issuerBlock", () => {
  it("既定の法人は旧 ISSUER 定数と同じ文字列になる（既存書類の見た目を変えない）", () => {
    expect(issuerBlock(CKK, "ja")).toEqual(LEGACY_ISSUER);
    // 英語・中国語の書類も、英名が無いので ja に落ちて従来どおり。
    expect(issuerBlock(CKK, "en")).toEqual(LEGACY_ISSUER);
    expect(issuerBlock(CKK, "zh")).toEqual(LEGACY_ISSUER);
  });
  it("マスタが空なら旧定数", () => {
    expect(issuerBlock(null, "ja")).toEqual(LEGACY_ISSUER);
  });
  it("受取先の言語で名称を引き、無い項目は省く", () => {
    expect(issuerBlock(TSP, "en")).toEqual({
      name: "TSP Co., Ltd.",
      address: "愛知県名古屋市",
      tel: "TEL: 052-000-0000",
      invoice_reg: "T9999999999999",
    });
  });
});

describe("groupByOwnCompany", () => {
  it("既定の法人を先頭に、法人ごとに束ねる", () => {
    const rows = [
      { n: "a", c: 2 },
      { n: "b", c: null },
      { n: "c", c: 1 },
      { n: "d", c: 2 },
    ];
    const g = groupByOwnCompany(rows, (r) => r.c, 1);
    expect(g.map((x) => x.companyId)).toEqual([1, 2]);
    expect(g[0].items.map((r) => r.n)).toEqual(["b", "c"]);
    expect(g[1].items.map((r) => r.n)).toEqual(["a", "d"]);
  });
  it("1 社だけなら 1 束", () => {
    const g = groupByOwnCompany([{ c: null }, { c: null }], (r) => r.c, 1);
    expect(g).toHaveLength(1);
    expect(g[0].companyId).toBe(1);
  });
});

describe("isValidInvoiceRegistrationNo", () => {
  it("T + 13 桁か空", () => {
    expect(isValidInvoiceRegistrationNo("T1234567890123")).toBe(true);
    expect(isValidInvoiceRegistrationNo("")).toBe(true);
    expect(isValidInvoiceRegistrationNo("1234567890123")).toBe(false);
    expect(isValidInvoiceRegistrationNo("T123")).toBe(false);
  });
});
