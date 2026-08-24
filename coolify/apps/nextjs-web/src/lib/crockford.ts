/**
 * crockford.ts — 紛らわしい文字を除いた英数字コードの生成・正規化。
 *
 * ※ TWIN FILE: coolify/apps/nextjs-kiosk/src/lib/crockford.ts と同一内容。
 *   共有パッケージ機構が無いため複製で運用 — 変更時は両方を更新すること。
 *
 * アルファベットは I / O / 0 / 1 を除外（QR カード・登録コードの目視入力用）。
 * 保存は正規化形（大文字・ダッシュなし）、表示は 4 文字区切り。
 */

export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** `crypto.getRandomValues` ベースのコード生成（rejection sampling で偏りなし）。 */
export function generateCode(length: number): string {
  const chars: string[] = [];
  const max = 256 - (256 % CODE_ALPHABET.length); // 偏り回避の上限
  while (chars.length < length) {
    const buf = new Uint8Array(length * 2);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < max && chars.length < length) {
        chars.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      }
    }
  }
  return chars.join("");
}

/** 入力の正規化: 大文字化・英数字以外（ダッシュ・空白）を除去。
 * I/O/0/1 はアルファベット外なので、含む入力は単に一致しない。 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** 表示用: 4 文字ごとにダッシュ区切り。 */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}
