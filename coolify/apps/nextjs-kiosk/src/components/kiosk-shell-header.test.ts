/**
 * ヘッダーの利用者名の判定。
 *
 * **ログアウトしても前の利用者の名前が残っていた**のを直したときの試験。
 * 名前はサーバー側の layout が解決するが、ログアウトは router.replace の
 * 画面遷移で、layout は同じものが使い回されるため再描画されない。
 * つまり props は前の名前を持ったまま残る。**居る画面で打ち消す**のが
 * この関数で、共有端末はログイン前に誰でも見る画面なので、ここが緩むと
 * 「前に使った人の名前が出たまま」になる。
 */

import { describe, expect, it } from "vitest";
import {
  headerUserName,
  headerUserSlot,
  LOGGED_OUT_ROUTES,
} from "./KioskShell";

describe("headerUserName", () => {
  it("ログイン中の画面では名前を出す", () => {
    expect(headerUserName("/", "山田 太郎")).toBe("山田 太郎");
    expect(headerUserName("/steps", "山田 太郎")).toBe("山田 太郎");
    expect(headerUserName("/steps/abc", "山田 太郎")).toBe("山田 太郎");
  });

  // これが本体 — 取り残された props を信用しない
  it("ログイン系の画面では、名前が渡ってきても出さない", () => {
    for (const route of LOGGED_OUT_ROUTES) {
      expect(headerUserName(route, "山田 太郎")).toBeNull();
    }
  });

  // usePathname() は**クエリを含まない**ので、渡ってくるのは常に素の道。
  // /device-error?reason=… のような入力は起こらない。
  it("ログイン系の下位ページでも出さない", () => {
    expect(headerUserName("/device-error", "山田")).toBeNull();
    expect(headerUserName("/setup/anything", "山田")).toBeNull();
  });

  // 名前で始まるだけの別の画面まで巻き込まない
  it("似た名前の画面は巻き込まない", () => {
    expect(headerUserName("/loginhistory", "山田")).toBe("山田");
    expect(headerUserName("/setup-guide", "山田")).toBe("山田");
  });

  it("そもそも未ログインなら null のまま", () => {
    expect(headerUserName("/", null)).toBeNull();
  });
});

/**
 * 「未ログイン」と書いてよいのは、誰も居ないことが**確実**なときだけ。
 *
 * ログイン直後にヘッダーが「未ログイン」のままだった不具合を直したときの試験。
 * 原因は遷移側（layout が使い回されて props が古いまま）だったが、DB 不通で
 * セッションを読めなかったときにも同じ表示になっていた — 本文はログイン中の
 * まま動いているのに頭だけが「未ログイン」と言う状態。**分からないときは黙る**。
 */
describe("headerUserSlot", () => {
  it("ログイン中は名前を出す", () => {
    expect(headerUserSlot("/", "山田 太郎", true, true)).toBe("user");
    expect(headerUserSlot("/steps/abc", "山田 太郎", true, true)).toBe("user");
  });

  it("誰も居ないことが確実なら「未ログイン」と書く", () => {
    expect(headerUserSlot("/", null, true, true)).toBe("notLoggedIn");
    // ログイン画面は、名前が取り残されていても未ログインが確実
    expect(headerUserSlot("/login", "山田 太郎", true, true)).toBe(
      "notLoggedIn",
    );
  });

  // これが本体 — 読めなかったことを「誰も居ない」と言い換えない
  it("セッションを読めなかったときは黙る", () => {
    expect(headerUserSlot("/", null, true, false)).toBe("hidden");
    expect(headerUserSlot("/steps", null, true, false)).toBe("hidden");
  });

  it("未登録端末はまだ登録の話をしている段階なので出さない", () => {
    expect(headerUserSlot("/setup", null, false, true)).toBe("hidden");
    expect(headerUserSlot("/", null, false, true)).toBe("hidden");
  });

  // 読めていて名前もあるなら、登録状態に関わらず名前が勝つ
  it("名前が解決できていれば user が勝つ", () => {
    expect(headerUserSlot("/", "山田", false, false)).toBe("user");
  });
});
