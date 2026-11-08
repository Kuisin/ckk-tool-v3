// 仕訳 CSV のバイト列化（BOM・文字コード）のテスト。
//
// 会計ソフトの受入は Shift_JIS 指定のことが多く、そこを間違えると
// 「取り込めるが全部文字化けしている」という一番気づきにくい壊れ方をする。
// バイト列そのものを見るテストにしてある。
import { describe, expect, it } from "vitest";
import { encodeAccountingCsv } from "./accounting-encode";

const hex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");

describe("encodeAccountingCsv", () => {
  it("utf8-bom は BOM（EF BB BF）で始まる", () => {
    const { bytes, contentType } = encodeAccountingCsv("日付", "utf8-bom");
    expect(hex(bytes).startsWith("ef bb bf")).toBe(true);
    expect(contentType).toBe("text/csv; charset=utf-8");
  });

  it("utf8 は BOM を付けない", () => {
    const { bytes } = encodeAccountingCsv("日付", "utf8");
    expect(hex(bytes).startsWith("ef bb bf")).toBe(false);
  });

  it("shift_jis は BOM 無しで、日 = 93 FA", () => {
    const { bytes, contentType, unmappable } = encodeAccountingCsv(
      "日",
      "shift_jis",
    );
    expect(hex(bytes)).toBe("93 fa");
    expect(contentType).toBe("text/csv; charset=Shift_JIS");
    expect(unmappable).toEqual([]);
  });

  it("shift_jis で ASCII と改行はそのまま", () => {
    const { bytes } = encodeAccountingCsv("A,1\r\n", "shift_jis");
    expect(hex(bytes)).toBe("41 2c 31 0d 0a");
  });

  it("変換できない文字は代替され、どれが落ちたかを返す", () => {
    const { bytes, unmappable } = encodeAccountingCsv("A™B", "shift_jis");
    // ™ は CP932 に無いので "?" (0x3f) に落ちる。
    expect(hex(bytes)).toBe("41 3f 42");
    expect(unmappable).toEqual(["™"]);
  });

  it("UTF-8 では何も落ちない", () => {
    expect(encodeAccountingCsv("A™B", "utf8").unmappable).toEqual([]);
  });

  it("元から ? の文字を「落ちた」と誤判定しない", () => {
    expect(encodeAccountingCsv("なぜ?", "shift_jis").unmappable).toEqual([]);
  });
});
