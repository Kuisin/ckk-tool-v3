#!/usr/bin/env node
/**
 * i18n-templates.mjs — 変数入りテンプレートを `tr(鍵, { 穴 })` に直す（抽出も兼ねる）。
 *
 *   node tools/i18n/i18n-templates.mjs --keys        # 訳す鍵を出す（1 行 1 件）
 *   node tools/i18n/i18n-templates.mjs --dry
 *   node tools/i18n/i18n-templates.mjs
 *
 * 鍵の作り方は lib/template.mjs（抽出と書き換えで同じ関数を使う — ずれると
 * 辞書と一致しない）。辞書に無い鍵は**書き換えない**。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUDED } from "./lib/scan.mjs";
import { accessorPlanner, ensureAccessor } from "./lib/codemod.mjs";
import { findTemplates, parseTemplateBody } from "./lib/template.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DATA = path.join(HERE, "data");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

const dict = {};
Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "seed.json"), "utf8")));
for (const f of fs.readdirSync(path.join(DATA, "translations")))
  if (f.endsWith(".json"))
    Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "translations", f), "utf8")));

// 明示的に対象外にした文言（固有名詞・ログなど）は鍵にしない。
const skip = new Set(JSON.parse(fs.readFileSync(path.join(DATA, "skip.json"), "utf8")).items);

const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (EXCLUDED.some((r) => r.test(f))) continue;
    if (e.isDirectory()) { walk(f); continue; }
    if (/\.tsx?$/.test(e.name)) files.push(f);
  }
};
walk(path.join(REPO, "coolify/apps/nextjs-web/src"));

if (has("--keys")) {
  const keys = new Set();
  for (const file of files)
    for (const t of findTemplates(fs.readFileSync(file, "utf8"))) {
      const p = parseTemplateBody(t.body);
      if (p && !skip.has(p.key) && !Object.hasOwn(dict, p.key)) keys.add(p.key);
    }
  for (const k of [...keys].sort()) console.log(JSON.stringify(k));
  console.error(`untranslated template keys: ${keys.size}`);
  process.exit(0);
}

let touched = 0, rewritten = 0, skippedNoScope = 0;
const needHook = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/.test(source);
  // **クライアントコンポーネントだけを書き換える。**
  //
  // サーバー側（actions.ts / data.ts / lib/*.ts）の変数入り文字列は、画面の
  // 文言・サーバーログ・**DB に書く値**が混ざっていて機械的に見分けられない。
  // 実際 `billing/closings/actions.ts` の `` `${name}（ロット ${lot}）` `` は
  // 請求明細の `description` として保存される DB の値で、操作した人の言語で
  // 訳してしまうと**データが壊れる**（帳票は受取先の言語で出す — 用語集 §2.7）。
  //
  // 変数の無い文字列は「後から訳す」でサーバー側も救えるが、変数入りは値を
  // 埋めた後では鍵に戻せないので late translation が効かない。ここは線を引いて
  // 触らない。残りは locale を引数で受ける形へ人が直す仕事として残す。
  if (!isClient) continue;
  const edits = [];
  // 先に「そこに tr を置けるか」を聞く。置けない場所は書き換えない
  // （書き換えてから置けずに落ちる、という順序を避ける）。
  const canPlace = accessorPlanner(source, { requireAsync: !isClient });
  for (const t of findTemplates(source)) {
    const p = parseTemplateBody(t.body);
    if (!p || skip.has(p.key) || !Object.hasOwn(dict, p.key)) continue;
    // すでに trf(...) の引数なら触らない
    if (/\btr\(\s*$/.test(source.slice(Math.max(0, t.start - 6), t.start))) continue;
    if (!canPlace(t.start)) { skippedNoScope++; continue; }
    const vars = p.slots.map((s) => `${s.name}: ${s.expr.trim()}`).join(", ");
    edits.push({ start: t.start, end: t.end, text: `tr(${JSON.stringify(p.key)}, { ${vars} })` });
  }
  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let code = source;
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  // `tr` をどこから取るかは codemod.mjs の判定を使い回す。
  const acc = ensureAccessor(code, {
    accessor: isClient ? "const tr = useTr();" : "const tr = await getTr();",
    requireAsync: !isClient,
  });
  code = acc.code;
  if (acc.added > 0) {
    const imp = isClient
      ? 'import { useTr } from "@/hooks/useTr";'
      : 'import { getTr } from "@/lib/ui-text-server";';
    if (!code.includes(imp)) {
      const first = code.search(/^import\s/m);
      code = first >= 0 ? `${code.slice(0, first)}${imp}\n${code.slice(first)}` : `${imp}\n${code}`;
    }
  }
  touched++; rewritten += edits.length;
  console.log(`  ${path.relative(REPO, file)}  (${edits.length})`);
  if (!has("--dry")) fs.writeFileSync(file, code);
}
console.log(`\n${has("--dry") ? "[dry] " : ""}files ${touched}, templates ${rewritten}`);
if (skippedNoScope > 0)
  console.log(`skipped ${skippedNoScope} (no place to put tr — plain helper functions; pass tr as an argument by hand)`);
if (needHook.length) {
  console.log(`\n${needHook.length} files still need tr by hand:`);
  for (const f of needHook.slice(0, 40)) console.log("  ", f);
}
