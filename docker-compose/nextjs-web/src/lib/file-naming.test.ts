import { describe, expect, it } from "vitest";
import {
  avatarStorageKey,
  sanitizeFileName,
  systematicFileName,
} from "./file-naming";

describe("sanitizeFileName", () => {
  it("drops path segments", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("a\\b\\c.txt")).toBe("c.txt");
  });

  it("strips forbidden characters and collapses spaces", () => {
    expect(sanitizeFileName('a<b>:"|?*.pdf')).toBe("ab.pdf");
    expect(sanitizeFileName("見積 書 v2.pdf")).toBe("見積_書_v2.pdf");
  });

  it("strips leading dots (no hidden files)", () => {
    expect(sanitizeFileName(".htaccess")).toBe("htaccess");
  });

  it("falls back for empty input", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("///")).toBe("file");
  });
});

describe("systematicFileName", () => {
  it("matches {timestamp}_{rand}_{name}", () => {
    expect(systematicFileName("scan.pdf")).toMatch(
      /^\d{8}-\d{6}_[a-z2-9]{4}_scan\.pdf$/,
    );
  });

  it("prepends the label when given", () => {
    expect(systematicFileName("納品書.pdf", "PO-202608-00001")).toMatch(
      /^\d{8}-\d{6}_[a-z2-9]{4}_PO-202608-00001_納品書\.pdf$/,
    );
  });

  it("is unique across calls", () => {
    const names = new Set(
      Array.from({ length: 50 }, () => systematicFileName("a.txt")),
    );
    // 同一秒内でも乱数 4 桁で衝突確率は無視できる（50 件で重複なしを確認）
    expect(names.size).toBe(50);
  });
});

describe("avatarStorageKey", () => {
  const uid = "645bffad-83ca-4444-94fd-af1d8b0529c9";
  const at = 1_755_400_000_000;

  it("[userid]-large-[timestamp] / -small- で保存する", () => {
    expect(avatarStorageKey(uid, "large", "image/jpeg", at)).toBe(
      `avatars/${uid}-large-${at}.jpg`,
    );
    expect(avatarStorageKey(uid, "small", "image/jpeg", at)).toBe(
      `avatars/${uid}-small-${at}.jpg`,
    );
  });

  it("拡張子は保存 MIME に合わせる", () => {
    expect(avatarStorageKey(uid, "large", "image/png", at)).toBe(
      `avatars/${uid}-large-${at}.png`,
    );
    expect(avatarStorageKey(uid, "small", "image/webp", at)).toBe(
      `avatars/${uid}-small-${at}.webp`,
    );
  });

  it("差し替えのたびにキーが変わる（キャッシュを踏まない）", () => {
    const a = avatarStorageKey(uid, "large", "image/jpeg", at);
    const b = avatarStorageKey(uid, "large", "image/jpeg", at + 1);
    expect(a).not.toBe(b);
  });

  it("ユーザーごとに分かれる", () => {
    const other = "230963cc-be72-4991-a75f-662baa9da977";
    expect(avatarStorageKey(other, "large", "image/jpeg", at)).not.toBe(
      avatarStorageKey(uid, "large", "image/jpeg", at),
    );
  });
});
