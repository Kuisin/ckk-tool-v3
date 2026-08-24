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
});
