import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appList } from "./app-list";
import { LOCALES, type Locale } from "./i18n";
import {
  applyPermissionBlock,
  buildPermissionBlock,
  buildPermissionsReferencePage,
  extractPermissionBlock,
  MANUAL_PAGES,
  pageCode,
} from "./manual-permissions";
import { PERMISSIONS, permissionMeta } from "./permission-labels";

const CONTENT = join(__dirname, "../../content/manual");

/** ロケールごとのファイル名（ja は接尾辞なし）。 */
function fileFor(path: string, locale: Locale): string {
  return join(CONTENT, locale === "ja" ? `${path}.md` : `${path}.${locale}.md`);
}

/**
 * マニュアルの「必要な権限」欄を書き出す。中身の正は lib/ 側の登録簿なので、
 * ここは**生成して突き合わせるだけ**。文言を直すときは lib を直してから
 *   UPDATE_MANUAL=1 pnpm test -- src/lib/manual-permissions.test.ts
 * を流す。
 */
const WRITE = process.env.UPDATE_MANUAL === "1";

describe("マニュアルの「必要な権限」", () => {
  it("登録したページの .md が実在する（ja/en/zh）", () => {
    const missing: string[] = [];
    for (const page of MANUAL_PAGES) {
      for (const locale of LOCALES) {
        if (!existsSync(fileFor(page.path, locale))) {
          missing.push(fileFor(page.path, locale).replace(CONTENT, ""));
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("アプリの key が app-list に実在する", () => {
    const unknown = MANUAL_PAGES.filter(
      (p) => p.app && !appList.some((a) => a.key === p.app),
    ).map((p) => p.app);
    expect(unknown).toEqual([]);
  });

  it("要求する権限コードはラベル登録簿にある", () => {
    const unknown = MANUAL_PAGES.map(pageCode)
      .filter((c): c is string => c !== null)
      .filter((c) => !permissionMeta(c));
    expect([...new Set(unknown)]).toEqual([]);
  });

  /**
   * **アプリのマニュアルページを増やしたら、ここにも足す。**
   * 権限の案内が無いページが黙って増えるのを防ぐ。
   */
  it("operations 配下の user.md はすべて登録されている", () => {
    const found: string[] = [];
    const opsRoot = join(CONTENT, "operations");
    for (const category of readdirSync(opsRoot, { withFileTypes: true })) {
      if (!category.isDirectory()) continue;
      const catDir = join(opsRoot, category.name);
      for (const app of readdirSync(catDir, { withFileTypes: true })) {
        if (!app.isDirectory()) continue;
        if (existsSync(join(catDir, app.name, "user.md"))) {
          found.push(`operations/${category.name}/${app.name}/user`);
        }
      }
    }
    const registered = new Set(MANUAL_PAGES.map((p) => p.path));
    expect(found.filter((f) => !registered.has(f)).sort()).toEqual([]);
  });

  it("各ページの欄が登録簿と一致している", () => {
    const stale: string[] = [];
    for (const page of MANUAL_PAGES) {
      for (const locale of LOCALES) {
        const file = fileFor(page.path, locale);
        if (!existsSync(file)) continue;
        const source = readFileSync(file, "utf-8");
        const want = buildPermissionBlock(page, locale);
        if (WRITE) {
          writeFileSync(file, applyPermissionBlock(source, want));
          continue;
        }
        if (extractPermissionBlock(source) !== want.trim()) {
          stale.push(file.replace(CONTENT, ""));
        }
      }
    }
    expect(
      stale,
      "古い / 欠けている欄。UPDATE_MANUAL=1 で書き出し直す",
    ).toEqual([]);
  });
});

describe("参照ページ「権限とロール」", () => {
  it("実ファイルが登録簿と一致している（ja/en/zh）", () => {
    const stale: string[] = [];
    for (const locale of LOCALES) {
      const file = fileFor("permissions", locale);
      const want = buildPermissionsReferencePage(locale);
      if (WRITE) {
        writeFileSync(file, want);
        continue;
      }
      if (!existsSync(file) || readFileSync(file, "utf-8") !== want) {
        stale.push(file.replace(CONTENT, ""));
      }
    }
    expect(stale, "UPDATE_MANUAL=1 で書き出し直す").toEqual([]);
  });

  it("権限コードがすべて載る", () => {
    const md = buildPermissionsReferencePage("ja");
    for (const p of PERMISSIONS) expect(md).toContain(`\`${p.code}\``);
  });

  it("未実装のスコープは載せない（設定しても何も見えないため）", () => {
    const md = buildPermissionsReferencePage("ja");
    expect(md).toContain("拠点");
    expect(md).not.toContain("| 部門 |");
    expect(md).not.toContain("| チーム |");
  });

  it("認証と認可の説明から始まる", () => {
    const md = buildPermissionsReferencePage("ja");
    expect(md).toContain("## 認証と認可");
    expect(md).toContain("[はじめかた](start)");
    expect(md).toContain("[共有端末のはじめかた](operations/kiosk/start/user)");
  });

  it("権限の種類を 4 つとも説明している", () => {
    const md = buildPermissionsReferencePage("ja");
    expect(md).toContain("## 権限の種類");
    for (const g of ["業務", "マスタ・設定", "管理", "特権操作"]) {
      expect(md).toContain(`**${g}`);
    }
  });

  /**
   * 承認の仕組みは MS0B のマニュアルが持つ。ここで二重に説明すると、
   * 直すときに片方だけ古くなる（利用者からの指示）。
   */
  it("承認は MS0B のマニュアルへ案内するだけで、ここでは説明しない", () => {
    const md = buildPermissionsReferencePage("ja");
    expect(md).toContain("(operations/masters/approval-setting/user)");
    // 段・グループ・代理といった MS0B 側の説明を持ち込まない
    for (const word of [
      "承認グループに入っている",
      "代理",
      "第一承認",
      "段を",
    ]) {
      expect(md, `MS0B の説明が混ざっている: ${word}`).not.toContain(word);
    }
  });
});

/** 登録簿から 1 ページ引く。無ければ「そのページが消えた」と分かる形で落とす。 */
function page(match: (p: (typeof MANUAL_PAGES)[number]) => boolean) {
  const found = MANUAL_PAGES.find(match);
  if (!found) throw new Error("MANUAL_PAGES に対象のページがありません");
  return found;
}

describe("buildPermissionBlock", () => {
  const quote = page((p) => p.app === "quotes");

  it("日本語では権限の表示名とコードを出す", () => {
    const md = buildPermissionBlock(quote, "ja");
    expect(md).toContain("## 必要な権限");
    expect(md).toContain("**見積書**（`quote`）");
    expect(md).toContain("見積書 の 閲覧");
  });

  it("英語・中国語でも同じ構造になる", () => {
    expect(buildPermissionBlock(quote, "en")).toContain("**Quote** (`quote`)");
    expect(buildPermissionBlock(quote, "zh")).toContain(
      "**报价单**（`quote`）",
    );
  });

  it("権限の要らない画面はその旨だけ出す", () => {
    const kiosk = page((p) => p.path.endsWith("kiosk/start/user"));
    const md = buildPermissionBlock(kiosk, "ja");
    expect(md).toContain("特別な権限は要りません");
    expect(md).not.toContain("| したいこと |");
  });

  it("承認が要る操作は権限とセットで並ぶ", () => {
    const cards = page((p) => p.app === "kiosk-cards");
    const md = buildPermissionBlock(cards, "ja");
    expect(md).toContain("### 承認が要る操作");
    expect(md).toContain("特権アクセス（SY0G）");
    // 操作 → 必要な権限 → 何ができるか の 3 列
    expect(md).toContain(
      "| カードの発行 | QRカードの発行・PIN（`kiosk_card`）— 作成 |",
    );
  });

  it("同じ内容を二度当てても増えない（マーカーで差し替える）", () => {
    const md = buildPermissionBlock(quote, "ja");
    const once = applyPermissionBlock("# 見出し\n\n本文\n", md);
    const twice = applyPermissionBlock(once, md);
    expect(twice).toBe(once);
    expect(twice).toContain("本文");
  });
});
