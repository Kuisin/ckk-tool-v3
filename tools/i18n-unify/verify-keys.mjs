#!/usr/bin/env node
/**
 * verify-keys.mjs — 全ての `tr("鍵")` 呼び出しが messages/ja.json に
 * 実在するかを**実行時に**確かめる。
 *
 *   node tools/i18n-unify/verify-keys.mjs
 *
 * ■ なぜ TypeScript ではなくこの道具なのか
 * 鍵が 5,700 件を超えた時点で、next-intl の `AppConfig["Messages"]` 型付け
 * （全ての妥当な鍵をリテラル型の合併として列挙する）が TypeScript の型の
 * 複雑さの上限に触れ、実在する鍵まで「存在しない」と誤診断するようになった
 * （`src/global.d.ts` 参照）。型検査を諦めた代わりに、ここで実行時に
 * 同じことを確かめる——CI に組み込む想定（旧 `tools/i18n/i18n-verify-keys.mjs`
 * の役目を、鍵の形が変わった後継の messages 木に対して引き継ぐ）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");
const MESSAGES = path.join(REPO, "coolify/apps/nextjs-web/messages/ja.json");

const ja = JSON.parse(fs.readFileSync(MESSAGES, "utf8"));

function walk(node, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) walk(v, p, out);
    else out.add(p);
  }
  return out;
}
const validKeys = walk(ja, "", new Set());

const EXCLUDED = [/\/node_modules\//, /\.test\.tsx?$/, /\/design-preview\//];
function walkDir(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (EXCLUDED.some((re) => re.test(full))) continue;
    if (e.isDirectory()) { walkDir(full, out); continue; }
    if (/\.tsx?$/.test(e.name)) out.push(full);
  }
}
const files = [];
walkDir(WEB, files);

function maskLiterals(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => { for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " "; };
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") { const e = source.indexOf("\n", i); blank(i, e === -1 ? n : e); i = e === -1 ? n : e; continue; }
    if (c === "/" && source[i + 1] === "*") { const e = source.indexOf("*/", i + 2); blank(i, e === -1 ? n : e + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; let j = i + 1;
      while (j < n) { if (source[j] === "\\") { j += 2; continue; } if (source[j] === q) break; j++; }
      blank(i, Math.min(j + 1, n)); i = j + 1; continue;
    }
    i++;
  }
  return out.join("");
}
function matchParen(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "(") depth++;
    else if (masked[i] === ")") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function topLevelCommas(masked, from, to) {
  const out = []; let depth = 0;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) out.push(i);
  }
  return out;
}
function literalStringValue(source, start, end) {
  const trimmed = source.slice(start, end).trim();
  const m = /^(["'`])((?:\\.|(?!\1)[\s\S])*)\1$/.exec(trimmed);
  if (!m) return null;
  if (m[1] === "`" && /\$\{/.test(m[2])) return null;
  return m[2];
}

const missing = [];
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const masked = maskLiterals(source);
  const rel = path.relative(REPO, file);
  const re = /\b(tr|translate)\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = m.index + m[1].length;
    const close = matchParen(masked, open);
    if (close < 0) continue;
    const commas = topLevelCommas(masked, open + 1, close);
    const arg0End = commas.length > 0 ? commas[0] : close;
    const litValue = literalStringValue(source, open + 1, arg0End);
    if (litValue !== null) {
      checked++;
      if (!validKeys.has(litValue)) {
        const line = source.slice(0, m.index).split("\n").length;
        missing.push({ file: rel, line, key: litValue });
      }
    }
    re.lastIndex = arg0End;
  }
}

console.log(`tr() の鍵 ${checked} 件を検査`);
if (missing.length === 0) {
  console.log("✓ すべて messages/ja.json に実在します");
  process.exit(0);
}
console.error(`✗ messages/ja.json に無い鍵 ${missing.length} 件:`);
for (const m of missing.slice(0, 30)) console.error(`  - ${m.file}:${m.line}  ${JSON.stringify(m.key)}`);
process.exit(1);
