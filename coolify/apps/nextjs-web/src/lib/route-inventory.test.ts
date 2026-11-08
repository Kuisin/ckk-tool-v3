/**
 * route-inventory.test.ts — 「行き先のある URL」が実在するページに届くことを、
 * ファイルツリーだけで見張る。
 *
 * 2026-09 の在庫カテゴリ移設（/production/inventory → /inventory, #891）と
 * 会計連携の改称（/api/export/yayoi → /api/export/accounting, #890）のように、
 * パスの移設はランチャー（app-list.ts）・リダイレクト表（next.config.ts）・
 * 実ページ（src/app/**\/page.tsx）の 3 か所を同時に動かす。1 か所だけ取り残すと
 * 404 になるが、型でもビルドでも止まらず、開いてみるまで分からない。
 *
 * 見ているもの:
 *   1. app-list.ts の全 href が page.tsx に届く（リダイレクト頼みにしない —
 *      ランチャーは常に今の場所を指す）
 *   2. next.config.ts の redirects() の行き先が、実ページか別のリダイレクトに届く
 *      （行き先の無いリダイレクトは「旧 URL → 404」を「旧 URL → 新 URL → 404」に
 *      変えるだけで、直したことにならない）
 *
 * next.config.ts は fumadocs / next-intl のプラグインで包まれているので、その
 * 2 つを恒等関数に差し替えて素の設定だけを読む。
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { appList } from "./app-list";

vi.mock("fumadocs-mdx/next", () => ({
  createMDX: () => (config: unknown) => config,
}));
vi.mock("next-intl/plugin", () => ({
  default: () => (config: unknown) => config,
}));

const APP_DIR = resolve(__dirname, "../app");

/**
 * src/app 配下の page.tsx / route.ts を URL パターン（正規表現）に落とす。
 * ルートグループ `(dashboard)` は URL に現れない。動的セグメントは
 * `[id]` → 1 セグメント、`[...slug]` → 1 つ以上、`[[...slug]]` → 0 個以上。
 */
function collectRoutePatterns(): { pattern: RegExp; source: string }[] {
  const out: { pattern: RegExp; source: string }[] = [];
  const walk = (dir: string, segments: string[]): void => {
    for (const ent of readdirSync(dir)) {
      const p = join(dir, ent);
      if (statSync(p).isDirectory()) {
        if (ent.startsWith("(") && ent.endsWith(")")) walk(p, segments);
        else if (ent === "api" && segments.length === 0) walk(p, ["api"]);
        else walk(p, [...segments, ent]);
      } else if (ent === "page.tsx" || ent === "route.ts") {
        // (dashboard)/[...rest] は「どこにも当たらない URL を not-found へ流す」
        // ためのキャッチオールで、ページではない。これを数えると全 URL が
        // 「実在する」ことになり、この試験が何も見なくなる。
        if (segments.length === 1 && segments[0] === "[...rest]") continue;
        const re = segments
          .map((s) => {
            if (s.startsWith("[[...") && s.endsWith("]]")) return "(?:/[^/]+)*";
            if (s.startsWith("[...") && s.endsWith("]")) return "(?:/[^/]+)+";
            if (s.startsWith("[") && s.endsWith("]")) return "/[^/]+";
            return `/${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
          })
          .join("");
        out.push({
          pattern: new RegExp(`^${re || "/"}$`),
          source: `/${segments.join("/")}`,
        });
      }
    }
  };
  walk(APP_DIR, []);
  return out;
}

const ROUTES = collectRoutePatterns();

function pageExists(pathname: string): boolean {
  const clean = pathname.split("?")[0].replace(/\/$/, "") || "/";
  return ROUTES.some((r) => r.pattern.test(clean));
}

/**
 * `/inventory/:path*` のような接頭辞リダイレクトは「その下の何か」へ送る
 * ので、接頭辞そのものが実ページか、その下に実ページがあればよい。
 */
function prefixExists(prefix: string): boolean {
  const clean = prefix.replace(/\/$/, "") || "/";
  if (pageExists(clean)) return true;
  return ROUTES.some((r) => r.source.startsWith(`${clean}/`));
}

/**
 * next.config の `:param` / `:param*` / `:param(a|b)` を、実ページの動的
 * セグメントに当たる具体値へ置き換える（存在判定に使えればよいので値は適当）。
 */
function concretize(destination: string): string {
  return destination
    .replace(/:[A-Za-z_]+\([^)]*\)\*/g, "x")
    .replace(/:[A-Za-z_]+\([^)]*\)/g, "x")
    .replace(/:[A-Za-z_]+\*/g, "x")
    .replace(/:[A-Za-z_]+/g, "x");
}

async function loadRedirects(): Promise<
  { source: string; destination: string }[]
> {
  const mod = await import("../../next.config");
  const config = mod.default as {
    redirects?: () => Promise<{ source: string; destination: string }[]>;
  };
  return config.redirects ? await config.redirects() : [];
}

describe("URL の行き先が実在する", () => {
  it("app-list.ts の全 href が page.tsx に届く（リダイレクト経由でない）", () => {
    const missing = appList
      .filter((app) => !pageExists(app.href))
      .map((app) => `${app.operationCode} ${app.href}`);
    expect(missing).toEqual([]);
  });

  it("next.config.ts の redirect の行き先が、実ページか別の redirect に届く", async () => {
    const redirects = await loadRedirects();
    expect(redirects.length).toBeGreaterThan(0);
    const sources = new Set(redirects.map((r) => r.source));
    const dangling = redirects
      .filter((r) => r.destination.startsWith("/"))
      .filter((r) => {
        const wildcard = r.destination.match(/^(.*?)\/:[A-Za-z_]+\*$/);
        if (wildcard) return !prefixExists(concretize(wildcard[1]));
        const dest = concretize(r.destination);
        if (pageExists(dest)) return false;
        // 行き先がさらに別のリダイレクトの入口なら OK（2 段まで）。
        return !sources.has(r.destination);
      })
      .map((r) => `${r.source} → ${r.destination}`);
    expect(dangling).toEqual([]);
  });

  it("redirect の入口が実ページと同じ URL を奪っていない", async () => {
    // 実ページが在るのに同じ URL をリダイレクトで塞ぐと、そのページは
    // 二度と開けない。移設で旧パスを redirect に足すときの取りこぼし。
    const redirects = await loadRedirects();
    const shadowed = redirects
      .filter((r) => !r.source.includes(":") && !r.source.includes("("))
      .filter((r) => pageExists(r.source))
      .map((r) => r.source);
    expect(shadowed).toEqual([]);
  });
});
