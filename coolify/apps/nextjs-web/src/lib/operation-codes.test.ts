/**
 * operation-codes.test.ts — app-list.ts ↔ operation-codes.ts の整合を守る。
 *
 * なぜ必要か:
 *   アプリを 1 つ足すたびに 2 つのレジストリを手で直す必要があり、片方を忘れると
 *   「ホームにはカードが出るのに操作コード検索では出ない」という半端な状態になる。
 *   実際に SY0C（注文書取込）がその状態でしばらく放置された。型では守れないので
 *   テストで守る。
 */
import { describe, expect, it } from "vitest";
import {
  type AppCategory,
  appList,
  CATEGORY_COLORS,
  getAppsByCategory,
  isAppCategory,
} from "./app-list";
import {
  OPERATION_CODE_PATTERN,
  OPERATION_CODES,
  resolveOperationCode,
} from "./operation-codes";

describe("operation code registry", () => {
  it("すべてのコードが 4 文字の形式に一致する", () => {
    for (const entry of OPERATION_CODES) {
      expect(
        OPERATION_CODE_PATTERN.test(entry.code),
        `${entry.code} (${entry.label})`,
      ).toBe(true);
    }
  });

  it("コードが重複していない", () => {
    const seen = new Map<string, string>();
    for (const entry of OPERATION_CODES) {
      const previous = seen.get(entry.code);
      expect(
        previous,
        `${entry.code} が重複: ${previous} と ${entry.label}`,
      ).toBeUndefined();
      seen.set(entry.code, entry.label);
    }
  });

  it("code は categoryCode + mode + index から組み立てられている", () => {
    for (const entry of OPERATION_CODES) {
      expect(entry.code).toBe(
        `${entry.categoryCode}${entry.mode}${entry.index}`,
      );
    }
  });

  it("カテゴリはアプリカテゴリか共通のいずれか", () => {
    for (const entry of OPERATION_CODES) {
      const ok = entry.category === "共通" || isAppCategory(entry.category);
      expect(ok, `${entry.code} の category=${entry.category}`).toBe(true);
    }
  });
});

describe("app-list ↔ operation-codes parity", () => {
  it("appList の operationCode はすべて操作コードとして解決できる", () => {
    const missing = appList
      .filter((app) => resolveOperationCode(app.operationCode) === null)
      .map((app) => `${app.operationCode} (${app.label} / key=${app.key})`);
    expect(
      missing,
      "operation-codes.ts への登録漏れ — ランチャー検索に出ない",
    ).toEqual([]);
  });

  it("解決したエントリのカテゴリと href が appList と一致する", () => {
    for (const app of appList) {
      const entry = resolveOperationCode(app.operationCode);
      if (!entry) continue; // 上のテストが報告する
      expect(entry.category, `${app.operationCode} のカテゴリ`).toBe(
        app.category,
      );
      expect(entry.href, `${app.operationCode} の href`).toBe(app.href);
    }
  });

  it("一覧コード（mode=0）は appList かダッシュボードのどちらかに対応する", () => {
    const appCodes = new Set(appList.map((app) => app.operationCode));
    const orphans = OPERATION_CODES.filter(
      (entry) =>
        entry.mode === "0" &&
        entry.code !== "CM00" &&
        !appCodes.has(entry.code),
    ).map((entry) => `${entry.code} (${entry.label})`);
    expect(
      orphans,
      "operation-codes.ts にあるが appList に無い一覧コード",
    ).toEqual([]);
  });
});

describe("category maps", () => {
  it("getAppsByCategory がすべてのカテゴリを網羅している", () => {
    const covered = getAppsByCategory().map((section) => section.category);
    const declared = Object.keys(CATEGORY_COLORS) as AppCategory[];
    expect([...covered].sort()).toEqual([...declared].sort());
  });

  it("すべてのアプリがいずれかのカテゴリセクションに現れる", () => {
    const grouped = getAppsByCategory().flatMap((section) => section.apps);
    expect(grouped.length).toBe(appList.length);
  });

  it("アプリのキーが重複していない", () => {
    const keys = appList.map((app) => app.key);
    expect(new Set(keys).size, `重複キー: ${keys}`).toBe(keys.length);
  });
});
