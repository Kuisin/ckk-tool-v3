#!/usr/bin/env node
/**
 * unwrap-dynamic-calls.mjs — `tr(result.error)` のような**実行時の文字列**を
 * 引数にした呼び出しから `tr(...)` を剥がす。
 *
 *   node tools/i18n-unify/unwrap-dynamic-calls.mjs --dry
 *   node tools/i18n-unify/unwrap-dynamic-calls.mjs
 *
 * ■ なぜ剥がすのか（訳さないほうがマシ、ではなく訳せない）
 * next-intl の `t(key)` は**静的な鍵**しか引けない
 * （use-intl のリゾルバは `key.split(".")` で辿るだけ）。`result.error` は
 * サーバーが返した**すでに日本語の文字列そのもの**で、鍵ではない。
 * `tr` を本物の next-intl に差し替えた後にこれを渡すと、存在しない鍵を
 * 引いたことになり MISSING_MESSAGE のフォールバック文字列が出る——
 * 元の日本語がそのまま出ていた以前より**悪化する**。剥がして
 * `result.error` を直接使えば、日本語のままだが正しい文言が出る。
 *
 * ■ 対象を "サーバーの文字列を後から訳す" 系に絞る根拠
 * `tools/i18n-unify/scan-tr-calls.mjs` が引数が**文字列リテラルでない**
 * 呼び出しを "dynamic" として集めており、実態はほぼ 3 つの変数名
 * （`result.error` / `res.error` / `r.error`）に集約される——ActionResult の
 * エラーメッセージを画面側で訳していた箇所。サーバー側でリテラルとして
 * 書かれている `actionError("入力が不正です")` 自体を静的な鍵に移すのは
 * 別の作業（サーバー側で結果を返す前に訳す設計へ変える）で、今回は
 * 「クライアント側で意味を持たない呼び出しを外す」までを行う。
 *
 * ■ フックが不要になったら宣言ごと消す
 * この剥がしで `tr(...)` の呼び出しがファイルから 1 つも無くなったら、
 * `const tr = useTranslations();` / `const tr = await getTranslations();`
 * と、その import は使われない変数として残ってしまう。剥がした後で
 * 数え直し、要らなければ宣言・import ごと削る。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");
const dry = process.argv.includes("--dry");

// 実装そのもの（call site ではない）は対象外。
const SKIP_FILES = new Set([
  "src/lib/ui-text.ts",
  "src/lib/ui-text-server.ts",
  "src/lib/messages.ts",
  "src/hooks/useTr.ts",
]);

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

let filesChanged = 0;
let callsUnwrapped = 0;
let hooksRemoved = 0;

for (const file of files) {
  const rel = path.relative(REPO, file).replace(/\\/g, "/");
  const relFromWeb = `src/${path.relative(WEB, file)}`;
  if (SKIP_FILES.has(relFromWeb)) continue;

  let source = fs.readFileSync(file, "utf8");
  let masked = maskLiterals(source);

  const edits = [];
  const re = /\b(tr|translate)\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const fnName = m[1];
    const open = m.index + fnName.length;
    const close = matchParen(masked, open);
    if (close < 0) continue;
    const commas = topLevelCommas(masked, open + 1, close);
    const arg0End = commas.length > 0 ? commas[0] : close;
    const litValue = literalStringValue(source, open + 1, arg0End);
    if (litValue === null) {
      // 動的呼び出し。`tr(` と対応する `)` だけを剥がし、中身の式は残す。
      // vars 引数（第 2 引数以降）があれば、その式は使い道が無いので
      // 一緒に捨てる（`tr(x, {vars})` の形は実在しない——vars は常に
      // リテラルキーの呼び出しにしか付いていない。念のため確認する）。
      if (commas.length > 0) {
        // 想定外の形（動的な鍵 + vars）。安全側に倒して触らない。
        console.error(`  [skip] ${rel}: dynamic call has vars — ${source.slice(m.index, close + 1).slice(0, 80)}`);
        re.lastIndex = arg0End;
        continue;
      }
      edits.push({ start: m.index, end: close + 1, text: source.slice(open + 1, close).trim() });
    }
    re.lastIndex = arg0End;
  }

  if (edits.length === 0) continue;

  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) source = source.slice(0, e.start) + e.text + source.slice(e.end);
  callsUnwrapped += edits.length;
  filesChanged++;

  // 剥がした後、この変数を使う呼び出しがもう無ければ宣言・import ごと消す。
  //
  // ★ **`useTr()`/`getTr()`（旧形）のまま残っているファイルもある。**
  // `rewrite-call-sites.mjs` は「リテラルな呼び出しが 1 件も無いファイル」を
  // 早期に素通りするため、動的な呼び出し（`tr(result.error)`）しか無かった
  // ファイルはフックを差し替えられていない。剥がした後に旧形・新形の両方を
  // 見て、使われていなければどちらの形でも消す。
  masked = maskLiterals(source);
  const stillUsesTr = /\btr\(/.test(masked) || /\btranslate\(/.test(masked);
  if (!stillUsesTr) {
    const beforeLen = source.length;
    source = source.replace(/^\s*const tr = useTranslations\(\);\n/m, "");
    source = source.replace(/^\s*const tr = await getTranslations\(\);\n/m, "");
    source = source.replace(/^\s*const tr = useTr\(\);\n/m, "");
    source = source.replace(/^\s*const tr = await getTr\(\);\n/m, "");
    // import 自体が他のシンボルと同居していなければ丸ごと消す。
    source = source.replace(/import\s*\{\s*useTranslations\s*\}\s*from\s*["']next-intl["'];\n/, "");
    source = source.replace(/import\s*\{\s*getTranslations\s*\}\s*from\s*["']next-intl\/server["'];\n/, "");
    source = source.replace(/import\s*\{\s*useTr\s*\}\s*from\s*["']@\/hooks\/useTr["'];\n/, "");
    source = source.replace(/import\s*\{\s*getTr\s*\}\s*from\s*["']@\/lib\/ui-text-server["'];\n/, "");
    if (source.length !== beforeLen) hooksRemoved++;
  }

  if (!dry) fs.writeFileSync(file, source);
}

console.log(`\n${dry ? "[dry] " : ""}files ${filesChanged}, calls unwrapped ${callsUnwrapped}, unused hooks removed ${hooksRemoved}`);
