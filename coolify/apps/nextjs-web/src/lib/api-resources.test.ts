import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOpenApiDocument } from "./api-openapi";
import { API_NON_LIST_PATHS, API_RESOURCES } from "./api-resources";

const V1 = join(process.cwd(), "src", "app", "api", "v1");

/** 実ファイルから `/api/v1` の口を集める（登録簿ではなくディスクが正）。 */
function routePaths(dir = V1, prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...routePaths(full, `${prefix}/${name}`));
    } else if (name === "route.ts") {
      out.push(prefix || "/");
    }
  }
  return out.sort();
}

describe("API_RESOURCES は実ファイルと一致する", () => {
  const onDisk = routePaths();
  const declared = [
    ...API_RESOURCES.map((r) => r.path),
    ...API_NON_LIST_PATHS,
  ].sort();

  it("実ファイルが 1 つ以上ある（空振りで通さない）", () => {
    expect(onDisk.length).toBeGreaterThan(5);
  });

  it("登録簿に無い口がディスクに無い", () => {
    expect(onDisk.filter((p) => !declared.includes(p))).toEqual([]);
  });

  it("ディスクに無い口が登録簿に無い", () => {
    expect(declared.filter((p) => !onDisk.includes(p))).toEqual([]);
  });
});

describe("登録簿の中身", () => {
  it("path は重複しない", () => {
    const paths = API_RESOURCES.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("宣言した権限コードを実際にハンドラが要求している", () => {
    for (const r of API_RESOURCES) {
      const src = readFileSync(join(V1, r.path.slice(1), "route.ts"), "utf8");
      expect(
        src.includes(`"${r.permission}"`),
        `${r.path} は ${r.permission} を要求していない`,
      ).toBe(true);
    }
  });

  it("createdAt で並べるのは不変の台帳だけ", () => {
    const byCreated = API_RESOURCES.filter((r) => r.orderField === "createdAt");
    expect(byCreated.map((r) => r.path)).toEqual(["/inventory/transactions"]);
  });

  // 英語で固定する（機械向けの文書。_specs/i18n-glossary.md §1 の対象外）。
  it("summary と scope は ASCII 以外を含んでよいが、英語で書かれている", () => {
    for (const r of API_RESOURCES) {
      expect(r.summary.length).toBeGreaterThan(10);
      expect(r.scope.length).toBeGreaterThan(5);
      // 先頭は英大文字（日本語で書き始めていないこと）
      expect(r.summary[0]).toMatch(/[A-Z]/);
    }
  });
});

describe("OpenAPI 文書", () => {
  const doc = buildOpenApiDocument("1.2.3") as {
    openapi: string;
    info: { version: string };
    paths: Record<string, unknown>;
    components: { schemas: Record<string, unknown> };
  };

  it("3.1 で、version が入る", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe("1.2.3");
  });

  it("全資源が paths に出る", () => {
    for (const r of API_RESOURCES) expect(doc.paths[r.path]).toBeDefined();
  });

  it("health / me / deletions も出る", () => {
    for (const p of ["/health", "/me", "/deletions"]) {
      expect(doc.paths[p]).toBeDefined();
    }
  });

  it("health だけ認証不要（security: []）", () => {
    const health = doc.paths["/health"] as { get: { security?: unknown[] } };
    expect(health.get.security).toEqual([]);
    const me = doc.paths["/me"] as { get: { security?: unknown[] } };
    expect(me.get.security).toBeUndefined(); // 既定（bearerAuth）を継ぐ
  });

  it("封筒と問題詳細のスキーマがある", () => {
    expect(doc.components.schemas.Envelope).toBeDefined();
    expect(doc.components.schemas.Problem).toBeDefined();
  });

  it("JSON として往復できる", () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});
