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
 * 与えられた（masked な）引数リストに**本物の 2 つ目以降の引数**があるか。
 *
 * 深さ 0 のカンマを集め、**最後のカンマの後ろが空白しか無ければ**それは
 * Biome が複数行整形のために置いた末尾カンマとみなして数えない。
 * 残ったカンマが 1 つでもあれば、本物の vars がある。
 */
function hasRealSecondArg(maskedArgs) {
  let depth = 0;
  const commas = [];
  for (let i = 0; i < maskedArgs.length; i++) {
    const c = maskedArgs[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) commas.push(i);
  }
  if (commas.length === 0) return false;
  const last = commas[commas.length - 1];
  const trailingIsEmpty = maskedArgs.slice(last + 1).trim().length === 0;
  return trailingIsEmpty ? commas.length > 1 : true;
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
    //
    // ★ **Biome の「複数行なら末尾カンマ」を vars と誤認していたバグ**を直した。
    // `tr(\n  tr(\n    "text",\n  ),\n)` は引数がただ 1 つ（内側の呼び出し）でも、
    // 複数行に整形されているという理由だけで Biome が末尾にカンマを置く。
    // 「閉じた直後がカンマなら vars 有り」という素朴な判定は、この**中身の無い
    // 末尾カンマ**を「2 つ目の引数がある」と読み違えていた。3 段以上の入れ子
    // （`tr(tr(tr("…")))`）では内側・外側の両方でこれが起き、
    // `innerHasOwnVars && outerHasVars` の安全弁が常に働いて**一切たためない**
    // まま放置されていた（気づかず #727 をマージしていた）。
    // 「カンマの後ろに空白以外の中身があるか」まで見て、初めて本物の vars と
    // 判定する。
    const outerHasVars = hasRealSecondArg(masked.slice(innerClose + 1, outerClose));

    const innerArgs = source.slice(innerOpen + 1, innerClose); // 内側の引数全部
    const outerRest = outerHasVars
      ? source.slice(innerClose + 1, outerClose) // ", { vars… }" をそのまま引き継ぐ
      : "";

    // 内側の tr(...) 自身が第 2 引数（vars）を持つか。同じ末尾カンマの罠が
    // あるので、同じ判定関数を使う。
    const innerHasOwnVars = hasRealSecondArg(masked.slice(innerOpen + 1, innerClose));
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
