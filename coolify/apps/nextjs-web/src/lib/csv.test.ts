import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses simple rows and ignores blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\n\n4,5,6")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted fields with commas, quotes, and newlines", () => {
    expect(parseCsv('x,"a,b","he said ""hi"""\n"line1\nline2",p,q')).toEqual([
      ["x", "a,b", 'he said "hi"'],
      ["line1\nline2", "p", "q"],
    ]);
  });

  it("handles CRLF and a BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("toCsv", () => {
  it("quotes fields that need it and round-trips", () => {
    const rows = [
      ["k", "値"],
      ["a,b", "1"],
      ['q"q', "x\ny"],
    ];
    const csv = toCsv(rows);
    expect(csv).toContain('"a,b"');
    expect(parseCsv(csv)).toEqual(rows);
  });

  it("neutralizes a leading-= cell and round-trips", () => {
    // =1+2 would execute in Excel/Sheets; a leading ' pins it to text and needs
    // no RFC-4180 quoting. The neutralized value survives the parse round-trip.
    const csv = toCsv([["=1+2"]]);
    expect(csv).toBe("'=1+2");
    expect(parseCsv(csv)).toEqual([["'=1+2"]]);
  });

  it("neutralizes every dangerous leading char (= + - @ tab cr)", () => {
    for (const danger of ["=cmd", "+cmd", "-cmd", "@cmd", "\tcmd", "\rcmd"]) {
      const parsed = parseCsv(toCsv([[danger, "safe"]]));
      // after a write + read round-trip the cell still starts with ' so a
      // spreadsheet treats it as text, not a formula
      expect(parsed[0][0].startsWith("'")).toBe(true);
    }
  });

  it("leaves safe strings and numeric cells untouched", () => {
    // a negative number must NOT become '-100 or the value is corrupted
    const csv = toCsv([["hello", -100, 0.5, "a=b"]]);
    expect(csv).toBe("hello,-100,0.5,a=b");
    expect(parseCsv(csv)).toEqual([["hello", "-100", "0.5", "a=b"]]);
  });
});
