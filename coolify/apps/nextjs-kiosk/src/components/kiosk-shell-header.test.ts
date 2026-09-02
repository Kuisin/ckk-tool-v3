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
import { headerUserName, LOGGED_OUT_ROUTES } from "./KioskShell";

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
