/**
 * accounting-encode.ts — 仕訳 CSV のバイト列化（BOM・文字コード）。
 *
 * 会計ソフトの受入は **Shift_JIS 指定のことが多い**。Node の TextEncoder は
 * UTF-8 しか書けない（TextDecoder は shift_jis を読めるが、書けない）ので
 * `iconv-lite` を使う。
 *
 * **変換できない文字を黙って化けさせない。** Shift_JIS に無い文字（`™` や
 * 一部の環境依存文字）は代替文字に置き、どの文字が落ちたのかを呼び出し側へ
 * 返す — 摘要に入った 1 文字のせいで会計側が読めない CSV になったとき、
 * 「なぜか取り込めない」ではなく「この文字が落ちた」と分かるようにする。
 */

import iconv from "iconv-lite";
import type { AccountingEncoding } from "./accounting-export-core";

/** Shift_JIS に変換できなかった文字の代わりに置く 1 文字。 */
const SUBSTITUTE = "?";

export interface EncodedCsv {
  /**
   * `Uint8Array<ArrayBuffer>`（`ArrayBufferLike` ではない）— `Response` の
   * BodyInit が要求する形。Buffer はここに当てはまらないので必ず複写する。
   */
  bytes: Uint8Array<ArrayBuffer>;
  /** Response の content-type（charset 込み）。 */
  contentType: string;
  /** 変換できずに代替文字へ落ちた文字（重複なし）。空なら無損失。 */
  unmappable: string[];
}

/**
 * Shift_JIS に載らない文字を拾う。
 *
 * iconv-lite は変換できない文字を既定で `?` に落とすが、**何を落としたのかは
 * 教えてくれない**。1 文字ずつ往復させて、戻ってこなかったものを集める。
 * 全文字の往復は摘要 1 本ぶんの長さなら十分速く、ここは 1 請求書 1 回しか通らない。
 */
function findUnmappable(text: string): string[] {
  const lost = new Set<string>();
  for (const ch of text) {
    // 元から '?' の文字は落ちていない。
    if (ch === SUBSTITUTE) continue;
    const round = iconv.decode(iconv.encode(ch, "Shift_JIS"), "Shift_JIS");
    if (round !== ch) lost.add(ch);
  }
  return [...lost];
}

/** Buffer / TextEncoder の出力を Response が受け取れる形へ複写する。 */
function toBody(src: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

export function encodeAccountingCsv(
  text: string,
  encoding: AccountingEncoding,
): EncodedCsv {
  if (encoding === "shift_jis") {
    const unmappable = findUnmappable(text);
    const buf = iconv.encode(text, "Shift_JIS");
    return {
      bytes: toBody(buf),
      contentType: "text/csv; charset=Shift_JIS",
      unmappable,
    };
  }
  // BOM は Excel での文字化け防止も兼ねる。UTF-8 は全ての文字を表せるので
  // 落ちる文字は無い。
  const body = encoding === "utf8-bom" ? `﻿${text}` : text;
  return {
    bytes: toBody(new TextEncoder().encode(body)),
    contentType: "text/csv; charset=utf-8",
    unmappable: [],
  };
}
