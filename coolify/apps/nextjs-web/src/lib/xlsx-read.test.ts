/**
 * 読み取りの試験は**自前の書き出し（lib/xlsx.ts）との往復**で行う。
 * 本物の Excel が吐くファイルは手元で作れないが、少なくとも
 * 「こちらが配る雛形は必ず読める」ことは保証できる。
 *
 * 加えて、実際の Excel が使う書き方（インライン文字列・書式付き文字列の分割・
 * 飛んだセル）を手書きの XML/ZIP で組んで確かめる。
 */

import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, cellNumber, cellText } from "./xlsx";
import { columnIndex, readXlsx } from "./xlsx-read";

describe("columnIndex", () => {
  it("列名を 0 始まりの番号にする", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("B2")).toBe(1);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("BC12")).toBe(54);
  });
});

describe("往復（自前の書き出し → 読み取り）", () => {
  it("見出しと値がそのまま戻る", () => {
    const buf = buildXlsx({
      name: "検査項目",
      columns: [{ header: "項目名" }, { header: "単位" }, { header: "下限" }],
      rows: [
        [cellText("外径"), cellText("mm"), cellNumber(7.98)],
        [cellText("全長"), cellText("mm"), cellNumber(199.5)],
      ],
    });
    const rows = readXlsx(buf);
    expect(rows[0]).toEqual(["項目名", "単位", "下限"]);
    expect(rows[1]).toEqual(["外径", "mm", "7.98"]);
    expect(rows[2]).toEqual(["全長", "mm", "199.5"]);
  });

  it("XML で意味を持つ文字が壊れない", () => {
    const buf = buildXlsx({
      name: "s",
      columns: [{ header: "名称" }],
      rows: [[cellText('A&B <小> "引用" 0<x')]],
    });
    expect(readXlsx(buf)[1][0]).toBe('A&B <小> "引用" 0<x');
  });

  it("空セルは空文字で戻る（列の位置がずれない）", () => {
    const buf = buildXlsx({
      name: "s",
      columns: [{ header: "a" }, { header: "b" }, { header: "c" }],
      rows: [[cellText("1"), cellText(""), cellText("3")]],
    });
    expect(readXlsx(buf)[1]).toEqual(["1", "", "3"]);
  });
});

// ── 本物の Excel が使う書き方 ───────────────────────────────────────────────

/** 最小の .xlsx を手で組む（中身の XML を差し替えて試すため）。 */
function zipOf(entries: Record<string, string>): Buffer {
  const names = Object.keys(entries);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(entries[name], "utf8");
    const deflated = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + deflated.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}

const sheet = (rows: string) =>
  `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;

describe("Excel が実際に使う書き方", () => {
  it('共有文字列（t="s"）を引ける', () => {
    const buf = zipOf({
      "xl/sharedStrings.xml":
        "<sst><si><t>外径</t></si><si><t>mm</t></si></sst>",
      "xl/worksheets/sheet1.xml": sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      ),
    });
    expect(readXlsx(buf)[0]).toEqual(["外径", "mm"]);
  });

  // 一部だけ太字にすると <si> が <r> に割れる。連結しないと文字が欠ける
  it("書式で分割された文字列を 1 つに戻す", () => {
    const buf = zipOf({
      "xl/sharedStrings.xml":
        "<sst><si><r><t>外</t></r><r><t>径</t></r></si></sst>",
      "xl/worksheets/sheet1.xml": sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row>',
      ),
    });
    expect(readXlsx(buf)[0]).toEqual(["外径"]);
  });

  it('インライン文字列（t="inlineStr"）も読む', () => {
    const buf = zipOf({
      "xl/worksheets/sheet1.xml": sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>直接</t></is></c></row>',
      ),
    });
    expect(readXlsx(buf)[0]).toEqual(["直接"]);
  });

  // 空セルは <c> ごと省かれることがある。r 属性で位置を合わせないと列がずれる
  it("飛ばされたセルの位置を r 属性で合わせる", () => {
    const buf = zipOf({
      "xl/worksheets/sheet1.xml": sheet(
        '<row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row>',
      ),
    });
    expect(readXlsx(buf)[0]).toEqual(["1", "", "3"]);
  });

  it("飛ばされた行も空行で埋める", () => {
    const buf = zipOf({
      "xl/worksheets/sheet1.xml": sheet(
        '<row r="1"><c r="A1"><v>1</v></c></row><row r="3"><c r="A3"><v>3</v></c></row>',
      ),
    });
    const rows = readXlsx(buf);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual([]);
    expect(rows[2]).toEqual(["3"]);
  });

  // 読めないものを黙って空で返すと、欠けた表を「取り込めた」と思わせる
  it("Excel でないファイルは読めないと言う", () => {
    expect(() => readXlsx(Buffer.from("これは xlsx ではない"))).toThrow(
      /ZIP の終端/,
    );
  });

  it("ワークシートが無ければ読めないと言う", () => {
    expect(() => readXlsx(zipOf({ "docProps/app.xml": "<x/>" }))).toThrow(
      /ワークシート/,
    );
  });
});
