/**
 * xlsx-read.ts — 最小の Excel (.xlsx) 読み取り。**依存なし**。
 *
 * 書き出し（lib/xlsx.ts）と対になる読み取り側。あちらには「読み込みが要るなら
 * ライブラリを検討せよ」と書いてあるが、**ここで受けるのはこちらが配った雛形**
 * なので形が決まっており、必要なのは「セルの文字を格子で取り出す」ことだけ。
 * それだけのために 1MB 超の依存を足す判断はしなかった（利用者と相談のうえ）。
 *
 * .xlsx は「XML を数枚入れた ZIP」でしかない:
 *   xl/worksheets/sheet1.xml … セル。文字列は共有表への番号で入る
 *   xl/sharedStrings.xml     … その共有表
 * 展開は Node の zlib（inflateRaw）で足りる。ZIP の目録を読む部分だけ自前。
 *
 * ★ **読めない形は読めないと言う。** 推測して詰めると、利用者は「取り込めた」と
 *   思ったまま中身が欠けた表を使うことになる。分からなければ throw して、
 *   呼び出し側が「この行は読めません」と出せるようにする。
 *
 * ★ 返すのは**文字列の格子だけ**。型（数値・日付）は解釈しない — 検査表の取込に
 *   要るのは文字で、Excel の日付連番を復元する必要が無いため。要るようになったら
 *   そのときにライブラリを検討し直すこと（この実装を育てない）。
 */

import { inflateRawSync } from "node:zlib";
import type { Tr } from "./i18n";

// ── ZIP ─────────────────────────────────────────────────────────────────────

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/** ZIP の中身を「名前 → 中身」で取り出す。 */
function unzip(buf: Buffer, tr: Tr): Map<string, Buffer> {
  // End of Central Directory は末尾にある（コメントがあると少し手前）
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(tr("api.xlsxRead.zipEndNotFound"));

  const entryCount = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();

  for (let n = 0; n < entryCount; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL_SIGNATURE) {
      throw new Error(tr("api.xlsxRead.zipDirectoryCorrupt"));
    }
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // 実体の位置はローカルヘッダを読まないと分からない（extra の長さが違う）
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    if (method === 0) files.set(name, Buffer.from(raw));
    else if (method === 8) files.set(name, inflateRawSync(raw));
    else {
      throw new Error(
        tr("api.xlsxRead.unsupportedCompression", { method, name }),
      );
    }

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ── XML ─────────────────────────────────────────────────────────────────────

/** XML の実体参照を戻す。 */
function xmlUnescape(s: string): string {
  return (
    s
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
        String.fromCodePoint(Number.parseInt(h, 16)),
      )
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      // & は最後（先に戻すと二重に解釈される）
      .replace(/&amp;/g, "&")
  );
}

/** `<t>` の中身をすべて連結する（書式付き文字列は `<r><t>` に割れている）。 */
function textOf(xml: string): string {
  const out: string[] = [];
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m = re.exec(xml);
  while (m) {
    out.push(xmlUnescape(m[1]));
    m = re.exec(xml);
  }
  return out.join("");
}

/** 共有文字列表（番号 → 文字）。 */
function sharedStrings(files: Map<string, Buffer>): string[] {
  const xml = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m = re.exec(xml);
  while (m) {
    out.push(textOf(m[1]));
    m = re.exec(xml);
  }
  return out;
}

/** セル参照（"BC12"）→ 0 始まりの列番号。 */
export function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 最初のワークシートの XML。 */
function firstSheetXml(files: Map<string, Buffer>, tr: Tr): string {
  // 並びは名前順で決め打ちしない（sheet10 が sheet2 より先に来る）
  const names = [...files.keys()].filter((n) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(n),
  );
  if (names.length === 0) throw new Error(tr("api.xlsxRead.noWorksheet"));
  names.sort((a, b) => {
    const num = (s: string) => Number(/(\d+)\.xml$/.exec(s)?.[1] ?? 0);
    return num(a) - num(b);
  });
  return files.get(names[0])?.toString("utf8") ?? "";
}

/**
 * .xlsx を**文字列の格子**にする（先頭シートのみ）。
 *
 * 行・列の穴は空文字で埋める（`r` 属性を見るので、飛んだセルも位置が合う）。
 */
export function readXlsx(buf: Buffer, tr: Tr): string[][] {
  const files = unzip(buf, tr);
  const shared = sharedStrings(files);
  const xml = firstSheetXml(files, tr);

  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch = rowRe.exec(xml);
  while (rowMatch) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? 0);
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch = cellRe.exec(rowMatch[2]);
    let auto = 0;
    while (cellMatch) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/i.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : auto;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";

      let value = "";
      if (type === "s") {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "-1");
        value = shared[idx] ?? "";
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "str") {
        // 数式の結果（文字列）
        value = xmlUnescape(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      } else {
        value = xmlUnescape(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      }

      while (cells.length < col) cells.push("");
      cells[col] = value;
      auto = col + 1;
      cellMatch = cellRe.exec(rowMatch[2]);
    }
    // 行番号が飛んでいたら空行で埋める（見出しからの相対位置を保つ）
    if (rowNumber > 0) {
      while (rows.length < rowNumber - 1) rows.push([]);
      rows[rowNumber - 1] = cells;
    } else {
      rows.push(cells);
    }
    rowMatch = rowRe.exec(xml);
  }
  return rows;
}
