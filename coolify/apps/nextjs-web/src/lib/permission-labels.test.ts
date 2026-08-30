import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appList } from "./app-list";
import { LOCALES } from "./i18n";
import {
  ACTION_LABEL,
  PERMISSIONS,
  permissionLabel,
  permissionLabelWithCode,
  permissionMeta,
  SCOPE_LABEL,
} from "./permission-labels";
import { PRIVILEGED_OPERATIONS } from "./privileged-operations";

const REPO = join(__dirname, "../../../../..");

/** seed / migration の SQL から権限コードを拾う（INSERT INTO app.permissions の行）。 */
function codesInSql(relPath: string): string[] {
  const sql = readFileSync(join(REPO, relPath), "utf-8");
  const block = sql.split("INSERT INTO app.permissions")[1] ?? "";
  return [...block.matchAll(/^\s*\('([a-z_]+)',/gm)].map((m) => m[1]);
}

describe("PERMISSIONS レジストリ", () => {
  it("コードが重複していない", () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("ja / en / zh がすべて埋まっている（空文字も不可）", () => {
    for (const p of PERMISSIONS) {
      for (const locale of LOCALES) {
        expect(
          p.label[locale]?.trim(),
          `${p.code} の label.${locale}`,
        ).toBeTruthy();
        expect(
          p.summary[locale]?.trim(),
          `${p.code} の summary.${locale}`,
        ).toBeTruthy();
      }
    }
  });

  it("アクション・スコープのラベルも 3 言語そろっている", () => {
    for (const [key, v] of Object.entries({
      ...ACTION_LABEL,
      ...SCOPE_LABEL,
    })) {
      for (const locale of LOCALES) {
        expect(v[locale]?.trim(), `${key}.${locale}`).toBeTruthy();
      }
    }
  });

  /**
   * DB の app.permissions と食い違わせない。seed にコードを足したのに
   * ここへ足し忘れると、画面とマニュアルにコードが生で出る。
   */
  it("seed / migration にあるコードはすべて登録されている", () => {
    const seeded = new Set([
      ...codesInSql("shared-db/sql/rbac-seed.sql"),
      ...codesInSql(
        "shared-db/prisma/migrations/20260903090000_general_apps_permissions/migration.sql",
      ),
      ...codesInSql(
        "shared-db/prisma/migrations/20260919090000_privileged_access/migration.sql",
      ),
    ]);
    expect(seeded.size).toBeGreaterThan(20); // 抽出そのものが壊れていないこと
    const missing = [...seeded].filter((c) => !permissionMeta(c));
    expect(missing, "permission-labels.ts に無いコード").toEqual([]);
  });

  it("アプリが要求する権限コードはすべて登録されている", () => {
    const missing = appList
      .map((a) => a.requiredPermission)
      .filter((c): c is string => c !== null)
      .filter((c) => !permissionMeta(c));
    expect([...new Set(missing)]).toEqual([]);
  });

  it("特権操作のコードもすべて登録されている", () => {
    const missing = PRIVILEGED_OPERATIONS.map((o) => o.code).filter(
      (c) => !permissionMeta(c),
    );
    expect([...new Set(missing)]).toEqual([]);
  });

  it("未知のコードはコードをそのまま返す（画面が空欄にならない）", () => {
    expect(permissionLabel("no_such_code")).toBe("no_such_code");
    expect(permissionLabelWithCode("no_such_code")).toBe("no_such_code");
  });

  it("既定の言語は日本語", () => {
    expect(permissionLabel("quote")).toBe("見積書");
    expect(permissionLabel("quote", "en")).toBe("Quote");
    expect(permissionLabelWithCode("quote")).toBe("見積書（quote）");
  });
});
