/**
 * inventory-note-params.test.ts — 構造化ノート（encodeInventoryNote）の
 * **鍵と差し込み変数が、3 言語の文言と噛み合っていること**を検査する。
 *
 * なぜ要るか: ノートは書いた側が鍵と変数だけを保存し、読む側が自分の言語で
 * 文言に差し込む（inventory-note-core.ts）。この 2 つは型で繋がっていないので、
 * 片方だけ直しても **コンパイルは通り、試験も通り、画面で初めて壊れる**。
 * 壊れ方は「文言の代わりに鍵がそのまま出る」で、しかも失敗経路にしか出ない
 * ものが多いため誰も踏まないまま残る。
 *
 * 実際に残っていた: 品目統合で呼び出し側を `productId` → `itemId` に変えた
 * とき、文言 3 本は `{productId}` のままだった。出荷で在庫台帳が無かった人の
 * 画面には `inventoryNote.lotInventoryMissing` という鍵が出ていた。
 *
 * 検査は 3 つ:
 *   1. 使っている鍵が ja / en / zh すべてにある
 *   2. 文言が要求する変数は、必ず呼び出し側が渡している（← 鍵が露出する原因）
 *   3. 渡している変数は、少なくとも 1 言語の文言で使われている（← 改名の取り残し）
 *
 * キオスク側の呼び出しも読む（文言を持っているのは web だけなので、
 * 向こうで足した鍵はこちらの messages に無いと同じ壊れ方をする）。
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ja from "../../messages/ja.json";
import zh from "../../messages/zh.json";

const MESSAGES: Record<string, Record<string, string>> = {
  ja: ja.inventoryNote as Record<string, string>,
  en: en.inventoryNote as Record<string, string>,
  zh: zh.inventoryNote as Record<string, string>,
};

/** 呼び出しを探す根。キオスクが無い環境（アプリ単体のビルド）では黙って飛ばす。 */
const ROOTS = ["src", "../nextjs-kiosk/src"].filter((p) => fs.existsSync(p));

interface Call {
  key: string;
  params: Set<string>;
  /** スプレッド（...x）が混ざっていて変数名を数え切れない呼び出し。 */
  opaque: boolean;
  where: string;
}

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      // 試験そのものは架空の鍵を使うので読まない。
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
        out.push(p);
    }
  };
  walk(root);
  return out;
}

function collect(): Call[] {
  const calls: Call[] = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("encodeInventoryNote(")) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "encodeInventoryNote"
        ) {
          const [keyArg, paramArg] = node.arguments;
          if (keyArg && ts.isStringLiteral(keyArg)) {
            const params = new Set<string>();
            let opaque = false;
            if (paramArg) {
              if (ts.isObjectLiteralExpression(paramArg)) {
                for (const prop of paramArg.properties) {
                  if (
                    (ts.isPropertyAssignment(prop) ||
                      ts.isShorthandPropertyAssignment(prop)) &&
                    (ts.isIdentifier(prop.name) ||
                      ts.isStringLiteral(prop.name))
                  ) {
                    params.add(prop.name.text);
                  } else opaque = true;
                }
              } else opaque = true;
            }
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            calls.push({
              key: keyArg.text,
              params,
              opaque,
              where: `${file}:${line + 1}`,
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return calls;
}

/** ICU の差し込み名（{name} / {name, number} の name）。 */
function placeholders(message: string): Set<string> {
  return new Set(
    [...message.matchAll(/\{\s*([A-Za-z0-9_]+)\s*[,}]/g)].map((m) => m[1]),
  );
}

const CALLS = collect();

describe("在庫ノートの鍵と差し込み変数", () => {
  it("呼び出しを 1 件以上拾えている（走査そのものが空振りしていない）", () => {
    expect(CALLS.length).toBeGreaterThan(10);
  });

  it("使っている鍵は ja / en / zh すべてにある", () => {
    const missing: string[] = [];
    for (const call of CALLS) {
      for (const [locale, dict] of Object.entries(MESSAGES)) {
        if (dict[call.key] === undefined)
          missing.push(`${locale}: ${call.key} (${call.where})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("文言が要求する変数は必ず渡っている（渡し忘れると鍵がそのまま画面に出る）", () => {
    const problems: string[] = [];
    for (const call of CALLS) {
      if (call.opaque) continue;
      for (const [locale, dict] of Object.entries(MESSAGES)) {
        const message = dict[call.key];
        if (message === undefined) continue;
        for (const need of placeholders(message)) {
          if (!call.params.has(need))
            problems.push(
              `${call.key} [${locale}] が要求する ${need} が ${call.where} で渡っていない`,
            );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("渡している変数は少なくとも 1 言語の文言で使われている（改名の取り残し）", () => {
    const problems: string[] = [];
    for (const call of CALLS) {
      const used = new Set<string>();
      for (const dict of Object.values(MESSAGES)) {
        const message = dict[call.key];
        if (message) for (const p of placeholders(message)) used.add(p);
      }
      if (used.size === 0) continue;
      for (const passed of call.params) {
        if (!used.has(passed))
          problems.push(
            `${call.key} に渡した ${passed} をどの言語の文言も使っていない (${call.where})`,
          );
      }
    }
    expect(problems).toEqual([]);
  });
});
