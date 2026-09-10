/**
 * token-core.ts — 不透明トークンの生成・ハッシュ・提示形式の解釈。
 *
 * 取引先ポータル（portal-auth.ts）と外部 API（api-auth.ts）の**両方**が使う。
 * もとは portal-auth.ts の中にあったが、API 側がポータルを import することに
 * なるので出した（portal-auth.ts は `server-only` で、そもそも import できない）。
 *
 * **`server-only` を付けない。** 純粋で、単体試験から直接呼べることに価値がある。
 * `node:crypto` しか触らないので Edge 以外ならどこでも動く。
 *
 * 規約（この 2 つはどの利用者も守ること）:
 *   - 生値は**発行の瞬間にしか存在しない**。DB に入れるのは sha256 だけ。
 *   - 表示用に持ってよいのは下 4 桁まで（そこからは復元できない）。
 */

import { createHash, randomBytes } from "node:crypto";

/** 生トークンの長さ。32 バイトを base64url にすると詰め物なしで 43 文字。 */
export const OPAQUE_TOKEN_LENGTH = 43;

/** 生トークンとして受け付ける形（base64url のみ・固定長）。 */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function sha256hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** 256bit の不透明トークン。`raw` は呼び出し側が 1 度だけ使い、保存しない。 */
export function mintToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256hex(raw) };
}

/** 画面に `●●●●●●ab3x` を出すための下 4 桁。短すぎる入力でも例外にしない。 */
export function tokenLast4(raw: string): string {
  return raw.length <= 4 ? raw : raw.slice(-4);
}

/**
 * `Authorization: Bearer <token>` から生トークンを取り出す。
 *
 * 形が違えば **DB を引く前に** null を返す。ここで弾いても漏れるのは
 * 「トークンの形式」だけで、それは公開情報（この文書に書いてある）。
 * 代わりに、当てずっぽうの通信が DB に届かなくなる。
 *
 * スキームは**大文字小文字を区別しない**（RFC 9110 §11.1 — `bearer` も正しい）。
 * 前後の空白は許すが、スキームとトークンの間の区切りは空白 1 つだけを認める。
 */
export function parseBearerToken(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  const space = trimmed.indexOf(" ");
  if (space < 0) return null;
  const scheme = trimmed.slice(0, space);
  if (scheme.toLowerCase() !== "bearer") return null;
  // 区切りが空白 2 つ以上なら不正（トークンに空白は入らない）。
  const rest = trimmed.slice(space + 1);
  if (rest !== rest.trim() || !TOKEN_SHAPE.test(rest)) return null;
  return rest;
}
