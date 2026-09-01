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

let touched = 0, rewritten = 0;
const needHook = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/.test(source);
  const edits = [];
  for (const t of findTemplates(source)) {
    const p = parseTemplateBody(t.body);
    if (!p || skip.has(p.key) || !Object.hasOwn(dict, p.key)) continue;
    // すでに trf(...) の引数なら触らない
    if (/\btr\(\s*$/.test(source.slice(Math.max(0, t.start - 6), t.start))) continue;
    const vars = p.slots.map((s) => `${s.name}: ${s.expr.trim()}`).join(", ");
    edits.push({ start: t.start, end: t.end, text: `tr(${JSON.stringify(p.key)}, { ${vars} })` });
  }
  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let code = source;
  for (const e of edits) code = code.slice(0, e.start) + e.text + code.slice(e.end);
  touched++; rewritten += edits.length;
  if (!/\bconst tr = (?:useTr\(\)|await getTr\(\))/.test(code)) needHook.push(path.relative(REPO, file) + (isClient ? "" : "  [server]"));
  console.log(`  ${path.relative(REPO, file)}  (${edits.length})`);
  if (!has("--dry")) fs.writeFileSync(file, code);
}
console.log(`\n${has("--dry") ? "[dry] " : ""}files ${touched}, templates ${rewritten}`);
if (needHook.length) {
  console.log(`\n${needHook.length} files need tr in scope:`);
  for (const f of needHook.slice(0, 40)) console.log("  ", f);
}
