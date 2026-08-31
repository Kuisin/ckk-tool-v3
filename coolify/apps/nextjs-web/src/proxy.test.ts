/**
 * proxy.test.ts — matcher が「認証を要求するパス」を正しく選んでいるか。
 *
 * ここを間違えた事故が 2 方向とも実際に起きている:
 *   - 広すぎ: `api/intake` と書いて `/api/intake/upload` の認証まで外した
 *   - 忘れ  : `/api/device-signals` を除外し忘れ、未ログインの POST が
 *             /login へ 307 されて機能が無言で死んだ（fetch から見ると
 *             転送先の HTML が 200 で返るので気づきにくい）
 *
 * matcher は `config` の静的な定数なので、実際にリクエストを流さなくても
 * 正規表現として検証できる。**取引先ポータルの分離はこの 1 本が支えている**。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * proxy.ts を **import せずに読む**理由が 2 つある:
 *  1. import すると NextAuth が読み込まれ、vitest の解決では next/server が
 *     引けずにテストごと落ちる。
 *  2. Next.js は middleware の `config` を**静的に**解析するので、matcher を
 *     別モジュールへ切り出して import すると抽出に失敗しうる。実物の
 *     リテラルのまま置いておきたい。
 * そこでファイルの実テキストから matcher を取り出して検証する。
 */
function readMatchers(): string[] {
  const src = readFileSync(join(__dirname, "proxy.ts"), "utf8");
  const block = src.match(/matcher:\s*\[([\s\S]*?)\]/);
  if (!block) throw new Error("proxy.ts の matcher が見つからない");
  const found = [...block[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    // TS の文字列リテラル中の \\. を実際の 1 文字に戻す
    m[1].replace(/\\(.)/g, "$1"),
  );
  if (found.length === 0) throw new Error("matcher の要素が読めない");
  return found;
}

const MATCHERS = readMatchers();

/** matcher に一致する = proxy を通る = 認証が要る。 */
function guarded(pathname: string): boolean {
  return MATCHERS.some((m) => new RegExp(`^${m}$`).test(pathname));
}

describe("読み取り", () => {
  it("matcher を 1 本以上取り出せている", () => {
    expect(MATCHERS.length).toBeGreaterThan(0);
    expect(MATCHERS[0]).toContain("portal");
  });
});

describe("proxy matcher — 内部ページは守られる", () => {
  const internal = [
    "/",
    "/sales/quotes",
    "/sales/quotes/QOT-202609-00001",
    "/billing/invoices",
    "/settings/users",
    "/settings/login-history",
    "/general/forms",
    "/profile",
    "/admin-manual",
    "/admin-manual/ja/kiosk",
    "/l/ABCD1234",
    "/f/some-form",
  ];
  for (const p of internal) {
    it(`${p} は認証が要る`, () => {
      expect(guarded(p)).toBe(true);
    });
  }

  it("セッション付きの内部 API も守られる", () => {
    for (const p of [
      "/api/intake/upload",
      "/api/intake/folder",
      "/api/intake/queue",
      "/api/attachments/upload",
      "/api/avatars",
      "/api/notifications",
      "/api/pdf/invoice",
    ]) {
      expect(guarded(p), p).toBe(true);
    }
  });
});

describe("proxy matcher — 公開パスは除外される", () => {
  const open = [
    "/login",
    "/api/auth/session",
    "/api/sso",
    "/api/preview/resolve",
    "/api/device-signals",
    "/api/health",
    "/api/intake/inbound",
    "/manual",
    "/manual/ja/operations",
    "/llms-manual",
    "/icon.svg",
    "/favicon.ico",
    "/manifest.webmanifest",
    "/sw.js",
  ];
  for (const p of open) {
    it(`${p} は認証を要求しない`, () => {
      expect(guarded(p)).toBe(false);
    });
  }
});

describe("proxy matcher — 取引先ポータル（社外向け）", () => {
  it("ポータルのページは Auth.js の認証を要求しない", () => {
    // ポータルは別の認証系（portal_session Cookie）。ここを守ると
    // 社外の人が必ず /login へ飛ばされて、機能そのものが成立しない。
    for (const p of [
      "/portal",
      "/portal/login",
      "/portal/documents",
      "/portal/documents/invoices/INV-202609-00001",
      "/portal/d/sometoken",
      "/portal/api/otp",
    ]) {
      expect(guarded(p), p).toBe(false);
    }
  });

  it("**`/portalXxx` は守られる**（素の `portal` と書いていない証拠）", () => {
    // `portal` を素で書くと前方一致で以下まで未認証になる。
    for (const p of ["/portals", "/portal-admin", "/portalsecret"]) {
      expect(guarded(p), p).toBe(true);
    }
  });

  it("設定画面（SY0H）はポータルではなく内部ページなので守られる", () => {
    expect(guarded("/settings/portal")).toBe(true);
  });
});
