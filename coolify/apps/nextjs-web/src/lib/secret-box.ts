/**
 * secret-box.ts — 設定値に混ざる「秘密」を暗号化して `app.system_settings`
 * に置くための封筒（AES-256-GCM, `node:crypto` のみ・依存追加なし）。
 *
 * 背景: system_settings は key→JSON の平文ストアで、`recordAudit` は
 * before/after をそのまま JSON に書き、Metabase からも読める。API トークンを
 * 素で置くと、その 3 箇所すべてに複製が残る。ここはその 1 点だけを守る。
 *
 * このリポジトリで秘密を保存するのは初めてなので、次に来るもの（SMTP の
 * パスワード等）が同じ鍵を使い回せるよう、env 名も API も **AI 専用にしない**。
 *
 * ## 設計のうち、後から効いてくる 3 点
 *
 * - **`kid`（派生鍵の指紋）を封筒に持つ。** これが無いと「鍵を替えた」と
 *   「暗号文が壊れた」を復号の失敗としてしか観測できず、鍵ローテーションが
 *   半年後に「なぜか AI が動かない」として出てくる。
 * - **`last4` は意図的に平文。** 鍵が無い・読めない状態でも画面に
 *   `●●●●●●ab3x` を出せる。下 4 桁からトークンは復元できない。
 * - **AAD に保存先のキー名を結ぶ。** 暗号文を別の設定枠へ貼り替えても
 *   復号できない（GCM の認証が落ちる）。
 *
 * 例外は投げず、必ず判別可能な結果を返す — 呼び出し側が「鍵が無い」と
 * 「壊れている」を取り違えないようにするため。
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";

/** 暗号鍵。`openssl rand -base64 32` の値をそのまま入れるのが想定。 */
const KEY_ENV = "SETTINGS_ENCRYPTION_KEY";
/** 鍵を入れ替えた直後の移行用（旧鍵）。読みだけに使う。 */
const PREV_KEY_ENV = "SETTINGS_ENCRYPTION_KEY_PREVIOUS";

const SCRYPT_SALT = "ckk-settings-v1";

export interface Sealed {
  v: 1;
  alg: "A256GCM";
  /** 派生鍵の指紋（sha256 の先頭 8 桁）。鍵違いを復号せずに見分けるため。 */
  kid: string;
  iv: string;
  ct: string;
  tag: string;
  /** 平文の下 4 桁（意図的）。鍵が無くても画面に出せるように。 */
  last4: string;
  updatedAt: string;
}

export type SealResult =
  | { ok: true; sealed: Sealed }
  | { ok: false; reason: "no-key" };

export type OpenResult =
  | { ok: true; secret: string; usedPreviousKey: boolean }
  | { ok: false; reason: "absent" | "no-key" | "key-mismatch" | "corrupt" };

/**
 * 32 byte ちょうどの base64 / hex ならそのまま鍵に使い、それ以外は scrypt で
 * 伸ばす。scrypt は 100ms 前後かかるのでプロセスに 1 回だけ計算する。
 */
const derivedCache = new Map<string, Buffer>();

function deriveKey(secret: string): Buffer {
  const cached = derivedCache.get(secret);
  if (cached) return cached;
  let key: Buffer | null = null;
  for (const enc of ["base64", "hex"] as const) {
    try {
      const buf = Buffer.from(secret, enc);
      // base64 は不正文字を黙って捨てるので、往復させて本物か確かめる。
      if (
        buf.length === 32 &&
        buf.toString(enc).replace(/=+$/, "") === secret.replace(/=+$/, "")
      ) {
        key = buf;
        break;
      }
    } catch {
      // 次の encoding を試す
    }
  }
  if (!key) key = scryptSync(secret, SCRYPT_SALT, 32);
  derivedCache.set(secret, key);
  return key;
}

function keyFrom(env: string): Buffer | null {
  const raw = process.env[env]?.trim();
  return raw ? deriveKey(raw) : null;
}

function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/** 鍵が設定されているか（保存を試みる前の判定に使う）。 */
export function hasEncryptionKey(): boolean {
  return keyFrom(KEY_ENV) !== null;
}

/** 暗号鍵の env 名（画面のエラー文言に出すため）。 */
export const ENCRYPTION_KEY_ENV = KEY_ENV;

export function sealSecret(plain: string, aad: string): SealResult {
  const key = keyFrom(KEY_ENV);
  if (!key) return { ok: false, reason: "no-key" };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    ok: true,
    sealed: {
      v: 1,
      alg: "A256GCM",
      kid: fingerprint(key),
      iv: iv.toString("base64url"),
      ct: ct.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      last4: plain.slice(-4),
      updatedAt: new Date().toISOString(),
    },
  };
}

function isSealed(v: unknown): v is Sealed {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    s.v === 1 &&
    s.alg === "A256GCM" &&
    typeof s.kid === "string" &&
    typeof s.iv === "string" &&
    typeof s.ct === "string" &&
    typeof s.tag === "string"
  );
}

function tryOpen(sealed: Sealed, key: Buffer, aad: string): string | null {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(sealed.iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ct, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function openSecret(value: unknown, aad: string): OpenResult {
  if (value === null || value === undefined || value === "")
    return { ok: false, reason: "absent" };
  if (!isSealed(value)) return { ok: false, reason: "corrupt" };

  const current = keyFrom(KEY_ENV);
  const previous = keyFrom(PREV_KEY_ENV);
  if (!current && !previous) return { ok: false, reason: "no-key" };

  for (const [key, isPrev] of [
    [current, false],
    [previous, true],
  ] as const) {
    if (!key || fingerprint(key) !== value.kid) continue;
    const secret = tryOpen(value, key, aad);
    // 指紋は合うのに開かない = 暗号文か AAD が壊れている（鍵違いではない）。
    if (secret === null) return { ok: false, reason: "corrupt" };
    return { ok: true, secret, usedPreviousKey: isPrev };
  }
  return { ok: false, reason: "key-mismatch" };
}

/** 封筒から、鍵が無くても取り出せる情報だけを読む（画面表示用）。 */
export function sealedLast4(value: unknown): string | null {
  return isSealed(value) && typeof value.last4 === "string"
    ? value.last4
    : null;
}
