import { afterEach, describe, expect, it } from "vitest";
import {
  hasEncryptionKey,
  openSecret,
  type Sealed,
  sealedLast4,
  sealSecret,
} from "./secret-box";

const AAD = "system_settings:ai_provider.api_token";
const KEY_A = "0DDJmt9BhVeYcCLZKgUEQlLKblkoBaC1PXDT5AwGE1k=";
const KEY_B = "Zr2m4Y8vQ1sT7wX0aB3cD6eF9gH2iJ5kL8mN1oP4qR0=";

function withKeys(current?: string, previous?: string) {
  if (current === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = current;
  if (previous === undefined)
    delete process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS;
  else process.env.SETTINGS_ENCRYPTION_KEY_PREVIOUS = previous;
}

afterEach(() => withKeys(undefined, undefined));

function seal(plain: string, key = KEY_A): Sealed {
  withKeys(key);
  const r = sealSecret(plain, AAD);
  if (!r.ok) throw new Error("seal failed");
  return r.sealed;
}

describe("secret-box", () => {
  it("往復する", () => {
    const sealed = seal("sk-test-abcd1234");
    expect(openSecret(sealed, AAD)).toEqual({
      ok: true,
      secret: "sk-test-abcd1234",
      usedPreviousKey: false,
    });
  });

  it("平文を封筒に残さない（last4 を除く）", () => {
    const sealed = seal("sk-test-abcd1234");
    const json = JSON.stringify(sealed);
    expect(json).not.toContain("sk-test-abcd1234");
    expect(json).not.toContain("sk-test");
    expect(sealed.last4).toBe("1234");
    expect(sealedLast4(sealed)).toBe("1234");
  });

  it("同じ平文でも毎回違う暗号文になる（IV がランダム）", () => {
    const a = seal("same-secret");
    const b = seal("same-secret");
    expect(a.ct).not.toBe(b.ct);
    expect(a.iv).not.toBe(b.iv);
    expect(a.kid).toBe(b.kid);
  });

  it("鍵が無ければ保存できない（例外ではなく no-key を返す）", () => {
    withKeys(undefined);
    expect(hasEncryptionKey()).toBe(false);
    expect(sealSecret("x", AAD)).toEqual({ ok: false, reason: "no-key" });
  });

  it("鍵を替えたら key-mismatch（corrupt と区別できる）", () => {
    const sealed = seal("sk-test-abcd1234", KEY_A);
    withKeys(KEY_B);
    expect(openSecret(sealed, AAD)).toEqual({
      ok: false,
      reason: "key-mismatch",
    });
    // 鍵が無くても下 4 桁は画面に出せる
    expect(sealedLast4(sealed)).toBe("1234");
  });

  it("旧鍵で読めたら usedPreviousKey を立てる（ローテーション移行）", () => {
    const sealed = seal("sk-test-abcd1234", KEY_A);
    withKeys(KEY_B, KEY_A);
    expect(openSecret(sealed, AAD)).toEqual({
      ok: true,
      secret: "sk-test-abcd1234",
      usedPreviousKey: true,
    });
  });

  it("暗号文が壊れていれば corrupt", () => {
    const sealed = seal("sk-test-abcd1234");
    withKeys(KEY_A);
    const broken = { ...sealed, ct: `${sealed.ct.slice(0, -2)}AA` };
    expect(openSecret(broken, AAD)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("別の設定枠へ貼り替えても開かない（AAD で保存先に結んでいる）", () => {
    const sealed = seal("sk-test-abcd1234");
    withKeys(KEY_A);
    expect(openSecret(sealed, "system_settings:something.else")).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("未設定・壊れた値をそれぞれ区別する", () => {
    withKeys(KEY_A);
    expect(openSecret(null, AAD)).toEqual({ ok: false, reason: "absent" });
    expect(openSecret(undefined, AAD)).toEqual({ ok: false, reason: "absent" });
    expect(openSecret("", AAD)).toEqual({ ok: false, reason: "absent" });
    expect(openSecret({ nope: 1 }, AAD)).toEqual({
      ok: false,
      reason: "corrupt",
    });
    expect(openSecret("plain-token", AAD)).toEqual({
      ok: false,
      reason: "corrupt",
    });
  });

  it("鍵が全く無いときは key-mismatch ではなく no-key", () => {
    const sealed = seal("sk-test-abcd1234");
    withKeys(undefined, undefined);
    expect(openSecret(sealed, AAD)).toEqual({ ok: false, reason: "no-key" });
  });

  it("base64 でない語句も鍵として使える（scrypt で伸ばす）", () => {
    const sealed = seal("just a passphrase", "just a passphrase");
    withKeys("just a passphrase");
    const r = openSecret(sealed, AAD);
    expect(r.ok && r.secret).toBe("just a passphrase");
  });
});
