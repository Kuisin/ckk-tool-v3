/**
 * password.ts — credentials ログイン・ポータルの確認コード・バックアップコードの
 * ハッシュ（scrypt, 依存なし）。形式: `<salt hex>:<hash hex>`
 * （N=16384, r=8, p=1, keylen=64 — scrypt 既定）。
 *
 * **非同期版だけを公開する**（監査 L1）。scryptSync は 1 回 50〜100ms の間
 * イベントループを止める。ログインもポータルの確認コード発行も未認証で
 * 叩ける口なので、同期版だと連打するだけでプロセス全体を止められた
 * （デコイのハッシュ計算まで含めて）。非同期版は libuv のスレッドプールで
 * 計算し、結果は同じ形式・同じ強度。既存のハッシュはそのまま照合できる。
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
