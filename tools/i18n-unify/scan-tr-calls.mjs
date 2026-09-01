#!/usr/bin/env node
/**
 * scan-tr-calls.mjs — 全ファイルの `tr(...)` / `translate(...)` 呼び出しを集める。
 *
 *   node tools/i18n-unify/scan-tr-calls.mjs > /tmp/tr-calls.json
 *
 * next-intl の `t(key)` は**鍵が静的でなければならない**（use-intl の
 * リゾルバは `key.split(".")` で辿るだけで、実行時の任意文字列を鍵として
 * 引く仕組みは無い）。なので呼び出しを 2 種類に分ける:
 *
 *   - **literal**  … `tr("保存しました")` — 第 1 引数が文字列リテラル。
 *     これは静的な鍵に変換できる（このスクリプトの対象）。
 *   - **dynamic**  … `tr(result.error)` / `tr(link.appLabel)` — 第 1 引数が
 *     実行時の値。サーバーが返した**すでに日本語の文字列**を後から訳す形で、
 *     鍵を持たない。next-intl の `t()` では原理的に表現できない
 *     （鍵が分からない訳を引けるわけがない）ので、この移行では**別枠**として
 *     報告するだけに留める。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");

const EXCLUDED = [
  /\/node_modules\//,
  /\.test\.tsx?$/,
  /\/design-preview\//,
];

function walkDir(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (EXCLUDED.some((re) => re.test(full))) continue;
    if (e.isDirectory()) {
      walkDir(full, out);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) out.push(full);
  }
}

const files = [];
walkDir(WEB, files);

/** 文字列・コメントを空白に潰す（改行は残す）。 */
function maskLiterals(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const e = source.indexOf("\n", i);
      blank(i, e === -1 ? n : e);
      i = e === -1 ? n : e;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      blank(i, e === -1 ? n : e + 2);
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") { j += 2; continue; }
        if (source[j] === q) break;
        j++;
      }
      blank(i, Math.min(j + 1, n));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** `open` の `(` に対応する `)` の位置。 */
function matchParen(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === "(") depth++;
    else if (masked[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 深さ 0 のカンマの位置一覧（引数の区切り）。 */
function topLevelCommas(masked, from, to) {
  const out = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    const c = masked[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) out.push(i);
  }
  return out;
}

/** 文字列リテラルなら decode した値を、そうでなければ null を返す。 */
function literalStringValue(source, start, end) {
  const trimmed = source.slice(start, end).trim();
  const m = /^(["'`])((?:\\.|(?!\1)[\s\S])*)\1$/.exec(trimmed);
  if (!m) return null;
  if (m[1] === "`" && /\$\{/.test(m[2])) return null; // テンプレートで式を含む
  return m[2]
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\`/g, "`")
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

const results = [];

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const masked = maskLiterals(source);
  const rel = path.relative(REPO, file);

  const re = /\b(tr|translate)\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const fnName = m[1];
    const open = m.index + fnName.length;
    const close = matchParen(masked, open);
    if (close < 0) continue;
    const commas = topLevelCommas(masked, open + 1, close);
    const arg0End = commas.length > 0 ? commas[0] : close;
    const hasSecondArg = commas.length > 0;
    const lineNo = source.slice(0, m.index).split("\n").length;

    const litValue = literalStringValue(source, open + 1, arg0End);
    results.push({
      file: rel,
      line: lineNo,
      fn: fnName,
      kind: litValue !== null ? "literal" : "dynamic",
      value: litValue,
      hasVars: hasSecondArg,
      argSource: litValue === null ? source.slice(open + 1, arg0End).trim() : undefined,
    });
    // ★ 外側の呼び出しの**閉じ括弧まで**丸ごと飛ばすと、vars 引数の中に
    // ある入れ子の tr(...)（`v2: enabled ? tr("表示") : tr("非表示")` のような
    // 形）を見つけられなくなる。第 1 引数の終わりまでだけ飛ばし、
    // vars 引数の中も引き続き探せるようにする。
    re.lastIndex = arg0End;
  }
}

const literal = results.filter((r) => r.kind === "literal");
const dynamic = results.filter((r) => r.kind === "dynamic");

console.error(`literal: ${literal.length}  dynamic: ${dynamic.length}  total: ${results.length}`);
process.stdout.write(JSON.stringify({ literal, dynamic }, null, 2));
