#!/usr/bin/env node
/**
 * i18n-dedupe-nested.mjs — `tr(tr(tr("…")))` のような多重包みを 1 段に潰す。
 *
 *   node tools/i18n/i18n-dedupe-nested.mjs --dry
 *   node tools/i18n/i18n-dedupe-nested.mjs
 *
 * ■ なぜ多重に包まれていたか
 * `lib/codemod.mjs` の「すでに `tr("…")` になっている」判定が、直前 **6 文字**
 * だけを見ていた。Biome が長い呼び出しを複数行に整形すると
 * （`tr(\n              "…",`）改行とインデントですぐ 6 文字を超え、
 * 「まだ包まれていない」と誤判定してもう一度包んでいた。この道具を再実行する
 * たびに 1 段ずつ増え、実際に 170 ファイルで `tr(tr(tr(tr("…"))))` まで
 * 積み上がっていた（判定そのものは同じコミットで直したので、今後は増えない —
 * これは**過去に積み上がった分**を剥がすための 1 回限りの道具）。
 *
 * ■ たたみ方
 * 内側の `tr(` を 1 つずつ剥がす。変数（第 2 引数）は**一番外側**にしか
 * 付かない（バグの積み方が「文字列トークンだけを包み直す」だったため、
 * 内側に足されるのは常に素の `tr(…)` で、vars は最初に templates codemod が
 * 置いたところに残り続ける）。よって剥がした後は「一番内側の文字列」+
 * 「一番外側にあった vars（あれば）」を持つ 1 回の `tr(…)` に落ち着く。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");
const KIOSK = path.join(REPO, "coolify/apps/nextjs-kiosk/src");

const dry = process.argv.includes("--dry");

/** 文字列・コメントを空白に潰す（改行は残す）。括弧の対応を安全に数えるため。 */
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

/** `open` の位置の `(` に対応する `)` の位置を返す（masked 前提）。 */
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

/**
 * 1 ファイルを 1 回たたむ（内側から順に見つかる最初の 1 件を処理して返す）。
 * 変化が無ければ null。
 */
function collapseOnce(source) {
  const masked = maskLiterals(source);
  const re = /\btr\(\s*tr\(/g;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const outerOpen = m.index + 2; // "tr" の直後の "("
    const innerOpen = masked.indexOf("(", m.index + 3);
    const innerClose = matchParen(masked, innerOpen);
    const outerClose = matchParen(masked, outerOpen);
    if (innerClose < 0 || outerClose < 0) continue;

    // 内側の tr(...) が外側の第 1 引数を**まるごと**占めているか
    // （閉じた直後がカンマか、外側の閉じ括弧そのもの）。
    const afterInner = source.slice(innerClose + 1, outerClose).trimStart();
    const outerHasVars = afterInner.startsWith(",");

    const innerArgs = source.slice(innerOpen + 1, innerClose); // 内側の引数全部
    const outerRest = outerHasVars
      ? source.slice(innerClose + 1, outerClose) // ", { vars… }" をそのまま引き継ぐ
      : "";

    // 内側の tr(...) 自身が第 2 引数（vars）を持つか — 括弧の深さ 0 の
    // カンマを探す。今回の壊れ方では内側は常に「素の tr(文字列)」なので
    // 起きないはずだが、両方に vars がある形は想定外として触らない
    // （安全側に倒して人が見る）。
    let innerHasOwnVars = false;
    {
      let depth = 0;
      const innerMasked = masked.slice(innerOpen + 1, innerClose);
      for (const ch of innerMasked) {
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        else if (ch === "," && depth === 0) { innerHasOwnVars = true; break; }
      }
    }
    if (innerHasOwnVars && outerHasVars) continue;

    const replacement = `tr(${innerArgs}${outerRest})`;
    const before = source.slice(0, m.index);
    const after = source.slice(outerClose + 1);
    return before + replacement + after;
  }
  return null;
}

function collapseAll(source) {
  let cur = source;
  let rounds = 0;
  for (;;) {
    const next = collapseOnce(cur);
    if (next === null) break;
    cur = next;
    rounds++;
    if (rounds > 20) break; // 保険（実際は最大 4 段程度）
  }
  return { code: cur, rounds };
}

function walk(dir, files) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(full, files);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) files.push(full);
  }
}

const files = [];
for (const root of [WEB, KIOSK]) if (fs.existsSync(root)) walk(root, files);

let totalFiles = 0;
let totalRounds = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  if (!/\btr\(\s*tr\(/.test(source.replace(/\/\/.*$/gm, ""))) continue;
  const { code, rounds } = collapseAll(source);
  if (rounds === 0) continue;
  totalFiles++;
  totalRounds += rounds;
  console.log(`  ${path.relative(REPO, file)}  (${rounds} 段たたんだ)`);
  if (!dry) fs.writeFileSync(file, code);
}
console.log(`\n${dry ? "[dry] " : ""}files ${totalFiles}, total collapses ${totalRounds}`);
