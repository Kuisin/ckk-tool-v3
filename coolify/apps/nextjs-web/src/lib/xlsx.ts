/**
 * xlsx.ts — 最小の Excel (.xlsx) 書き出し。**依存なし**。
 *
 * .xlsx は「XML を数枚入れた ZIP」でしかない。こちらが要るのは
 * **1 シート・見出し 1 行・型付きのセル**だけなので、読み込みもスタイル
 * エンジンも持たないこの実装で足りる（同じ判断の前例: lib/csv.ts / lib/qr.ts）。
 * ZIP の圧縮は Node の zlib、CRC32 だけ自前。
 *
 * CSV ではなく xlsx にしているのは、CSV だと
 *   - 日付・数値が文字列として開かれ、並べ替えも集計もできない
 *   - `0123` のような番号から先頭の 0 が落ちる
 * ため。表計算で続きの作業をする人に渡す前提なので、型を保って渡す。
 *
 * **書き出し専用**。読み込みが要るようになったら、そのときは素直に
 * ライブラリを検討すること（この実装を双方向に育てない）。
 */

import { deflateRawSync } from "node:zlib";

// ── セル ────────────────────────────────────────────────────────────────────

export type XlsxCell =
  | { type: "text"; value: string }
  | { type: "number"; value: number }
  /** 日時。Excel にタイムゾーンは無いので、指定の地域の壁時計に直して入れる。 */
  | { type: "datetime"; value: Date }
  | { type: "date"; value: Date }
  | { type: "blank" };

export interface XlsxColumn {
  header: string;
  /** 文字幅（Excel の列幅の単位）。省略時は見出しの長さから決める。 */
  width?: number;
}

export interface XlsxSheet {
  /** シート名。Excel の禁止文字と 31 文字制限はこちらで処理する。 */
  name: string;
  columns: XlsxColumn[];
  rows: XlsxCell[][];
}

export interface XlsxOptions {
  /** 日時セルを解釈する地域。既定は日本時間。 */
  timeZone?: string;
}

export const cellText = (value: string | null | undefined): XlsxCell =>
  value == null || value === "" ? { type: "blank" } : { type: "text", value };
export const cellNumber = (value: number | null | undefined): XlsxCell =>
  value == null || !Number.isFinite(value)
    ? { type: "blank" }
    : { type: "number", value };
export const cellDateTime = (value: Date | null | undefined): XlsxCell =>
  value == null ? { type: "blank" } : { type: "datetime", value };
export const cellDate = (value: Date | null | undefined): XlsxCell =>
  value == null ? { type: "blank" } : { type: "date", value };

// ── XML ─────────────────────────────────────────────────────────────────────

/**
 * XML のエスケープ。**制御文字も落とす** — XML 1.0 が許さない文字が 1 つでも
 * 混ざると Excel は「読み取れない内容」と言ってファイルごと開かない。
 * 利用者の入力がそのまま入るので、ここは通り道の全部を通る。
 */
export function xmlEscape(value: string): string {
  return (
    value
      // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 の禁止文字を落とすのが目的
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
  );
}

/** 0 始まりの列番号 → A, B, …, Z, AA, AB, … */
export function columnName(index: number): string {
  let n = index;
  let name = "";
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/**
 * シート名の正規化。Excel が禁じる文字（: \ / ? * [ ]）と 31 文字制限、
 * 先頭・末尾のシングルクォートを処理する。空になったら "Sheet1"。
 */
export function safeSheetName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^'+|'+$/g, "")
    .slice(0, 31);
  return cleaned || "Sheet1";
}

/**
 * Date → Excel のシリアル値（1899-12-30 起点）。
 *
 * Excel にタイムゾーンの概念は無く、入っている数値をそのまま壁時計として
 * 表示する。UTC のまま入れると日本の利用者には 9 時間ずれて見えるので、
 * **指定地域の壁時計へ直してからシリアル値にする**。
 */
export function excelSerial(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // 24 時制の formatToParts は 0 時を "24" で返すことがある。
  const hour = get("hour") % 24;
  const utcMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );
  // 25569 = 1970-01-01 のシリアル値（1900 年うるう年バグを織り込んだ値）。
  return utcMs / 86_400_000 + 25569;
}

/** スタイル番号（styles.xml の cellXfs の並びと一致させること）。 */
const STYLE_DEFAULT = 0;
const STYLE_HEADER = 1;
const STYLE_DATETIME = 2;
const STYLE_DATE = 3;

function cellXml(
  ref: string,
  cell: XlsxCell,
  timeZone: string,
  style = STYLE_DEFAULT,
): string {
  switch (cell.type) {
    case "blank":
      return style === STYLE_DEFAULT ? "" : `<c r="${ref}" s="${style}"/>`;
    case "number":
      return `<c r="${ref}"${style ? ` s="${style}"` : ""}><v>${cell.value}</v></c>`;
    case "datetime":
      return `<c r="${ref}" s="${STYLE_DATETIME}"><v>${excelSerial(cell.value, timeZone)}</v></c>`;
    case "date":
      return `<c r="${ref}" s="${STYLE_DATE}"><v>${Math.floor(excelSerial(cell.value, timeZone))}</v></c>`;
    default:
      // インライン文字列。共有文字列表を持たない代わりに 1 セルずつ書く
      // （表が数万行になるとサイズで不利だが、実装が半分になる）。
      return `<c r="${ref}"${style ? ` s="${style}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
  }
}

function sheetXml(sheet: XlsxSheet, timeZone: string): string {
  const colCount = sheet.columns.length;
  const lastCol = columnName(Math.max(0, colCount - 1));
  const lastRow = sheet.rows.length + 1;

  const cols = sheet.columns
    .map((c, i) => {
      // 全角を 2 文字ぶんと数えて幅を見積もる（日本語の見出しが潰れないように）。
      const guess =
        c.width ??
        Math.min(
          60,
          Math.max(
            8,
            [...c.header].reduce(
              (n, ch) => n + (/[\u0020-\u00ff]/.test(ch) ? 1 : 2),
              2,
            ),
          ),
        );
      return `<col min="${i + 1}" max="${i + 1}" width="${guess}" customWidth="1"/>`;
    })
    .join("");

  const header = sheet.columns
    .map((c, i) =>
      cellXml(
        `${columnName(i)}1`,
        { type: "text", value: c.header },
        timeZone,
        STYLE_HEADER,
      ),
    )
    .join("");

  const body = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, i) => cellXml(`${columnName(i)}${r + 2}`, cell, timeZone))
        .join("");
      return `<row r="${r + 2}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${colCount ? `<cols>${cols}</cols>` : ""}<sheetData><row r="1">${header}</row>${body}</sheetData>${colCount ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : ""}</worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

// numFmtId 164/165 は自前定義の書式（0〜163 は Excel の組み込み）。
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy/mm/dd\\ hh:mm"/><numFmt numFmtId="165" formatCode="yyyy/mm/dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="11"/><name val="Yu Gothic"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function workbookXml(sheetName: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

// ── ZIP ─────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * ZIP を組み立てる（deflate 固定・ZIP64 なし）。
 *
 * xlsx の中身は XML なので deflate がよく効く。4GB 超は扱わない — この用途で
 * 到達しないうえ、対応すると ZIP64 の実装がまるごと増える。
 */
function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.data);
    const deflated = deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // ローカルヘッダ署名
    local.writeUInt16LE(20, 4); // 展開に必要なバージョン (2.0)
    local.writeUInt16LE(0x0800, 6); // フラグ: ファイル名は UTF-8
    local.writeUInt16LE(8, 8); // 圧縮方式: deflate
    local.writeUInt16LE(0, 10); // 更新時刻
    local.writeUInt16LE(0x21, 12); // 更新日付（1980-01-01 固定 = 再現性のため）
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // 拡張フィールド長
    name.copy(local, 30);
    locals.push(local, deflated);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); // 中央ディレクトリ署名
    central.writeUInt16LE(20, 4); // 作成バージョン
    central.writeUInt16LE(20, 6); // 展開に必要なバージョン
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // 拡張フィールド長
    central.writeUInt16LE(0, 32); // コメント長
    central.writeUInt16LE(0, 34); // ディスク番号
    central.writeUInt16LE(0, 36); // 内部属性
    central.writeUInt32LE(0, 38); // 外部属性
    central.writeUInt32LE(offset, 42); // ローカルヘッダの位置
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + deflated.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 終端レコード署名
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // コメント長

  return Buffer.concat([...locals, centralBuf, end]);
}

// ── 入口 ────────────────────────────────────────────────────────────────────

/** 1 シートのブックを組み立てて .xlsx のバイト列を返す。 */
export function buildXlsx(sheet: XlsxSheet, options: XlsxOptions = {}): Buffer {
  const timeZone = options.timeZone || "Asia/Tokyo";
  const name = safeSheetName(sheet.name);
  const enc = (s: string) => new TextEncoder().encode(s);
  return zip([
    { name: "[Content_Types].xml", data: enc(CONTENT_TYPES) },
    { name: "_rels/.rels", data: enc(ROOT_RELS) },
    { name: "xl/workbook.xml", data: enc(workbookXml(name)) },
    { name: "xl/_rels/workbook.xml.rels", data: enc(WORKBOOK_RELS) },
    { name: "xl/styles.xml", data: enc(STYLES) },
    { name: "xl/worksheets/sheet1.xml", data: enc(sheetXml(sheet, timeZone)) },
  ]);
}
