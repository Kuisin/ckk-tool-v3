import { describe, expect, it } from "vitest";
import {
  encodeQrPayload,
  parseQrDocKey,
  parseQrPayload,
  QR_KINDS,
  qrKeyOfKind,
} from "./qr-payload";

describe("encodeQrPayload", () => {
  it("CKK:<KIND>:<KEY> で組み立てる", () => {
    expect(encodeQrPayload(QR_KINDS.WO, "1234")).toBe("CKK:WO:1234");
  });

  it("書類は「法人コード~番号」を載せる（番号は法人ごとの連番）", () => {
    expect(encodeQrPayload(QR_KINDS.INVOICE, "CKK~INV-2026-00001")).toBe(
      "CKK:INV:CKK~INV-2026-00001",
    );
    // 2 つの法人の同じ番号は別の QR になる
    expect(encodeQrPayload(QR_KINDS.INVOICE, "SUB~INV-2026-00001")).toBe(
      "CKK:INV:SUB~INV-2026-00001",
    );
  });

  it("DB の参照（法人コード/番号）を渡されたら ~ へ揃える", () => {
    expect(encodeQrPayload(QR_KINDS.QUOTE, "CKK/QOT-2026-00012")).toBe(
      "CKK:QOT:CKK~QOT-2026-00012",
    );
  });

  it("番号だけのキーはそのまま（PR-C より前の紙と同じ形）", () => {
    expect(encodeQrPayload(QR_KINDS.INVOICE, "INV-202608-00001")).toBe(
      "CKK:INV:INV-202608-00001",
    );
  });

  it("書類番号でないキーの / は触らない（作業場所コードなど）", () => {
    expect(encodeQrPayload(QR_KINDS.WORK_LOCATION, "A/01")).toBe(
      "CKK:LOC:A/01",
    );
  });

  it("種別は大文字へ正規化する", () => {
    expect(encodeQrPayload("wo", "7")).toBe("CKK:WO:7");
  });

  it("KEY の `:` は落とす（形式が壊れるため）", () => {
    expect(encodeQrPayload(QR_KINDS.WO, "12:34")).toBe("CKK:WO:1234");
  });
});

describe("parseQrPayload", () => {
  it("種別とキーに分ける", () => {
    expect(parseQrPayload("CKK:WO:1234")).toEqual({ kind: "WO", key: "1234" });
  });

  it("法人コード付きの書類キーをそのまま返す", () => {
    expect(parseQrPayload("CKK:INV:CKK~INV-2026-00001")).toEqual({
      kind: "INV",
      key: "CKK~INV-2026-00001",
    });
  });

  it("KEY 内のダッシュを保つ（法人コードの無い旧い紙）", () => {
    expect(parseQrPayload("CKK:INV:INV-202608-00001")).toEqual({
      kind: "INV",
      key: "INV-202608-00001",
    });
  });

  it("小文字で読み取られても解釈できる", () => {
    expect(parseQrPayload("ckk:card:abcd-efgh")).toEqual({
      kind: "CARD",
      key: "abcd-efgh",
    });
  });

  it("前後の空白・改行を無視する", () => {
    expect(parseQrPayload("  CKK:WO:9\n")).toEqual({ kind: "WO", key: "9" });
  });

  it("未知の種別もそのまま返す（読み手が判断する）", () => {
    expect(parseQrPayload("CKK:FUTURE:X1")).toEqual({
      kind: "FUTURE",
      key: "X1",
    });
  });

  it("プレフィクス無し（配布済みの素のカード ID）は null", () => {
    expect(parseQrPayload("ABCDEFGHJKLMNPQR")).toBeNull();
  });

  it("URL は null（従来の解釈へフォールバックさせる）", () => {
    expect(parseQrPayload("https://example.test/login?secret=ABCD")).toBeNull();
  });

  it("他社プレフィクス・キー欠落・空文字は null", () => {
    expect(parseQrPayload("XXX:WO:1")).toBeNull();
    expect(parseQrPayload("CKK:WO:")).toBeNull();
    expect(parseQrPayload("CKK:WO")).toBeNull();
    expect(parseQrPayload("")).toBeNull();
  });
});

describe("qrKeyOfKind", () => {
  it("種別が一致したときだけ KEY を返す", () => {
    expect(qrKeyOfKind("CKK:CARD:ABCD-EFGH", QR_KINDS.CARD)).toBe("ABCD-EFGH");
    expect(qrKeyOfKind("CKK:WO:1234", QR_KINDS.CARD)).toBeNull();
    expect(qrKeyOfKind("ABCDEFGHJKLMNPQR", QR_KINDS.CARD)).toBeNull();
  });

  it("往復する", () => {
    const raw = encodeQrPayload(QR_KINDS.WO, "4321");
    expect(qrKeyOfKind(raw, QR_KINDS.WO)).toBe("4321");
  });

  it("作業場所ラベル（LOC）を kind 指定で読める", () => {
    const raw = encodeQrPayload(QR_KINDS.WORK_LOCATION, "WL-A-01");
    expect(raw).toBe("CKK:LOC:WL-A-01");
    expect(qrKeyOfKind(raw, QR_KINDS.WORK_LOCATION)).toBe("WL-A-01");
    // 他種別の QR は作業場所として解釈されない
    expect(qrKeyOfKind("CKK:WO:1234", QR_KINDS.WORK_LOCATION)).toBeNull();
  });
});

describe("parseQrDocKey", () => {
  it("法人コード付きのキーを分ける", () => {
    expect(parseQrDocKey("CKK~INV-2026-00001")).toEqual({
      companyCode: "CKK",
      number: "INV-2026-00001",
    });
  });

  it("エンコードした QR を読み戻せる", () => {
    const key = qrKeyOfKind(
      encodeQrPayload(QR_KINDS.ORDER_ACCEPTANCE, "SUB/ORD-2026-00042"),
      QR_KINDS.ORDER_ACCEPTANCE,
    );
    expect(key).toBe("SUB~ORD-2026-00042");
    expect(parseQrDocKey(key as string)).toEqual({
      companyCode: "SUB",
      number: "ORD-2026-00042",
    });
  });

  it("PR-C より前の紙（番号だけ・旧番号）は法人コードが null", () => {
    expect(parseQrDocKey("INV-202608-00001")).toEqual({
      companyCode: null,
      number: "INV-202608-00001",
    });
    expect(parseQrDocKey("qot-2026-00003")).toEqual({
      companyCode: null,
      number: "QOT-2026-00003",
    });
  });

  it("書類番号でないキー（ロット番号・カード・作業場所）は null", () => {
    expect(parseQrDocKey("1234")).toBeNull();
    expect(parseQrDocKey("ABCD-EFGH-JKLM-NPQR")).toBeNull();
    expect(parseQrDocKey("A/01")).toBeNull();
  });
});
