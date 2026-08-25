/**
 * line-anchor.ts — 行差分と、行にぶら下げた印（コメント・blame）の追従。
 *
 * 社内文書 (CM03) の本文は Markdown ソースなので行番号が安定している。それを
 * 使って「旧版の N 行目 → 新版の何行目」を写し、編集しても行コメントが付いて
 * いった先を指し続けるようにする（GitHub の PR コメントと同じ挙動）。
 *
 * jsdiff は**差分のプリミティブとしてだけ**使う。追従の方針（消えた行は
 * outdated にして残す・本文の行数上限）はこのファイルが持つ。
 */

import { diffLines } from "diff";

/**
 * 1 文書の行数上限。差分は行数の積で効いてくるので、上限が無いと巨大な文書
 * 1 つでリクエストが張り付く。5,000 行あれば手順書には十分。
 */
export const MAX_DOC_LINES = 5000;

/**
 * 差分を取る前の正規化。**末尾に必ず改行を 1 つ付ける**のが要点。
 *
 * 末尾に改行が無い本文どうしを diff すると、jsdiff は最終行を「削除して
 * 書き直した」と見る（`a\nb` → `a\nb\nc` が -1/+2 になる）。行 blame と
 * 行コメントの追従がそれを真に受けると、触っていない行が変更扱いになる。
 * CRLF も揃える。
 */
export function normalizeBody(body: string): string {
  const text = body.replace(/\r\n?/g, "\n");
  if (text === "") return "";
  return text.endsWith("\n") ? text : `${text}\n`;
}

export function lineCountOf(body: string): number {
  return splitLines(body).length;
}

export function splitLines(body: string): string[] {
  const text = normalizeBody(body);
  if (text === "") return [];
  const lines = text.split("\n");
  lines.pop(); // 末尾の改行が作る空要素
  return lines;
}

export type DiffLineKind = "same" | "add" | "del";

export interface DiffLine {
  kind: DiffLineKind;
  /** 旧版での 1 始まり行番号（追加行は null）。 */
  oldLine: number | null;
  /** 新版での 1 始まり行番号（削除行は null）。 */
  newLine: number | null;
  text: string;
}

interface Part {
  added?: boolean;
  removed?: boolean;
  value: string;
}

/** 末尾の空要素を落として、チャンクを行の配列にする。 */
function partLines(value: string): string[] {
  const lines = value.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** 2 つの本文の行差分。表示にも、下の写像・統計にも使う。 */
export function diffBodies(oldBody: string, newBody: string): DiffLine[] {
  const parts = diffLines(
    normalizeBody(oldBody),
    normalizeBody(newBody),
  ) as Part[];
  const out: DiffLine[] = [];
  let oldNo = 1;
  let newNo = 1;

  for (const part of parts) {
    for (const text of partLines(part.value)) {
      if (part.added) {
        out.push({ kind: "add", oldLine: null, newLine: newNo, text });
        newNo += 1;
      } else if (part.removed) {
        out.push({ kind: "del", oldLine: oldNo, newLine: null, text });
        oldNo += 1;
      } else {
        out.push({ kind: "same", oldLine: oldNo, newLine: newNo, text });
        oldNo += 1;
        newNo += 1;
      }
    }
  }
  return out;
}

/**
 * 旧版の行番号 → 新版の行番号の写像。消えた行は null。
 *
 * 行コメントの `current_line` を保存時に一括で付け替えるために使う。null に
 * なったコメントは消さずに outdated として残す — `anchor_text` があるので
 * 「何への指摘だったか」は読める。
 */
export function remapLineAnchors(
  oldBody: string,
  newBody: string,
  lines: readonly number[],
): (number | null)[] {
  if (lines.length === 0) return [];
  const map = new Map<number, number>();
  for (const line of diffBodies(oldBody, newBody)) {
    if (line.kind === "same" && line.oldLine != null && line.newLine != null) {
      map.set(line.oldLine, line.newLine);
    }
  }
  return lines.map((n) => map.get(n) ?? null);
}

export interface DiffStats {
  added: number;
  removed: number;
  /** 新版で追加・変更された 1 始まりの行番号（blame の更新対象）。 */
  changedLines: number[];
}

export function diffStats(oldBody: string, newBody: string): DiffStats {
  const lines = diffBodies(oldBody, newBody);
  const changedLines: number[] = [];
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") {
      added += 1;
      if (line.newLine != null) changedLines.push(line.newLine);
    } else if (line.kind === "del") {
      removed += 1;
    }
  }
  return { added, removed, changedLines };
}

/**
 * 差分表示用に、変更のない長い塊を畳む。前後 `context` 行だけ残す。
 * 畳んだ位置には kind:"same" の代わりに null を挟んで返す（呼び出し側が
 * 「… N 行省略 …」を描く）。
 */
export function collapseUnchanged(
  lines: readonly DiffLine[],
  context = 3,
): (DiffLine | { skipped: number })[] {
  const keep = new Set<number>();
  lines.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let j = i - context; j <= i + context; j++) {
      if (j >= 0 && j < lines.length) keep.add(j);
    }
  });

  const out: (DiffLine | { skipped: number })[] = [];
  let run = 0;
  lines.forEach((line, i) => {
    if (keep.has(i)) {
      if (run > 0) {
        out.push({ skipped: run });
        run = 0;
      }
      out.push(line);
    } else {
      run += 1;
    }
  });
  if (run > 0) out.push({ skipped: run });
  return out;
}
