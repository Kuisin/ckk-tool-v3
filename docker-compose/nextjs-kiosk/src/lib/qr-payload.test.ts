import { describe, expect, it } from "vitest";
import {
  encodeQrPayload,
  parseQrPayload,
  QR_KINDS,
  qrKeyOfKind,
} from "./qr-payload";

describe("encodeQrPayload", () => {
  it("CKK:<KIND>:<KEY> で組み立てる", () => {
    expect(encodeQrPayload(QR_KINDS.WO, "1234")).toBe("CKK:WO:1234");
  });

  it("KEY のダッシュはそのまま（書類番号を人が読める形で載せる）", () => {
    expect(encodeQrPayload(QR_KINDS.INVOICE, "INV-202608-00001")).toBe(
      "CKK:INV:INV-202608-00001",
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

  it("KEY 内のダッシュを保つ", () => {
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
});
