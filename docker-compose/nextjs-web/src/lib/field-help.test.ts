import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fieldHelp, listFieldHelp, toAnchorId } from "./field-help";

/**
 * 入力欄の「?」からマニュアルへのリンクが切れていないことを保証する。
 *
 * マニュアル側の見出し（`### 納期 [#field-delivery-date]`）を消す・改名すると
 * ここが落ちる。docs のリンク検査は CI に無いので、この経路はテストで守る。
 */

const MANUAL = join(process.cwd(), "content/manual");
const LOCALES = ["", ".en", ".zh"] as const;

describe("field-help", () => {
  it("アンカー ID はキャメルケースをケバブ化する", () => {
    expect(toAnchorId("deliveryDate")).toBe("field-delivery-date");
    expect(toAnchorId("customerBranch")).toBe("field-customer-branch");
    expect(toAnchorId("notes")).toBe("field-notes");
  });

  it("HelpLabel に渡す props を組み立てる", () => {
    expect(fieldHelp("quote", "deliveryDate")).toEqual({
      label: "納期",
      help: expect.stringContaining("納入"),
      manual: "operations/sales/quote/user#field-delivery-date",
    });
    expect(fieldHelp("quote", "customer", { required: true }).required).toBe(
      true,
    );
  });

  it("登録した全項目の見出しがマニュアルに実在する（3 言語とも）", () => {
    const missing: string[] = [];
    for (const { app, field, anchor, manualPage } of listFieldHelp()) {
      for (const locale of LOCALES) {
        // manualPage は operations/<カテゴリ>/<アプリ>/<ページ名>（末尾は user とは限らない）
        const page = join(MANUAL, `${manualPage}${locale}.md`);
        if (!existsSync(page)) {
          missing.push(`${page}（ページが無い）`);
          continue;
        }
        // 明示 ID 記法: `### 見出し [#field-xxx]`
        if (!readFileSync(page, "utf8").includes(`[#${anchor}]`)) {
          missing.push(`${app}.${field} → ${manualPage}${locale}.md#${anchor}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("全アプリ・全項目が登録されている（登録漏れを数で気づけるように）", () => {
    const apps = new Set(listFieldHelp().map((f) => f.app));
    expect(apps.size).toBeGreaterThanOrEqual(31);
    expect(listFieldHelp().length).toBeGreaterThanOrEqual(200);
  });

  it("要約は空でない（? を出すのに中身が無い状態を防ぐ）", () => {
    for (const { app, field } of listFieldHelp()) {
      const { help } = fieldHelp(app as "quote", field as "deliveryDate");
      expect(help.trim().length, `${app}.${field}`).toBeGreaterThan(5);
    }
  });
});
