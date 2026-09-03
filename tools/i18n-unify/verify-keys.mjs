#!/usr/bin/env node
/**
 * verify-keys.mjs — 文言を引く呼び出しの鍵が messages/ja.json に
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
 *
 * ■ 検査する呼び出し（2 系統）
 *   葉の鍵   `tr` / `translate`（next-intl のフック）と、`lib/messages.ts` の
 *            `label` / `labelWith` / `localizedLabel`（フックを使えない場所
 *            用の関数 API。`import { label as msg }` の別名も追う）
 *   名前空間 `labelOptions` / `labelKeys`（その名前空間の直下を列挙する）
 * `label(key, locale, fallback)` を薄く包んだファイル内の `L(...)`
 * （intake.ts / inspection-sheet-pdf.ts）も、messages を import している
 * ファイルに限って同じ扱いにする。
 *
 * ■ 見落としの歴史（この 2 つを直すために手を入れた）
 * (1) **テンプレートリテラルの中が見えていなかった。** 文字列は丸ごと潰して
 *     いたので、`` `<th>${tr("...")}</th>` `` の形——つまり PDF や HTML を
 *     組み立てるファイルのほぼ全部——が検査対象から漏れていた。
 * (2) **`label()` 系を見ていなかった。** `tr` だけを見ていたため、リクエスト
 *     外（instrumentation.ts のポーラー、PDF テンプレート）から引かれる鍵が
 *     野放しだった。実際 `settings.orderIntake.pipeline.*` は 25 鍵すべてが
 *     未登録のまま出荷され、取込通知が「注文請書 {number} を自動取込しました」
 *     と変数の穴を晒していた。
 * どちらも「気づけるのは利用者が壊れた文字列を見たとき」だったので、ここで
 * 止める。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");
const MESSAGES = path.join(REPO, "coolify/apps/nextjs-web/messages/ja.json");

const ja = JSON.parse(fs.readFileSync(MESSAGES, "utf8"));

/** 葉（実際の文言）と枝（名前空間）を分けて持つ — 検査する対象が違うため。 */
const leafKeys = new Set();
const namespaceKeys = new Set();
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      namespaceKeys.add(p);
      walk(v, p);
    } else {
      leafKeys.add(p);
    }
  }
})(ja, "");

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

/**
 * 文字列とコメントを空白で潰した写しを作る（呼び出しの括弧・カンマだけを
 * 素直に数えられるようにするため）。**テンプレートリテラルの `${...}` の中は
 * 潰さない** — そこにも呼び出しが書けるので、潰すと丸ごと見えなくなる。
 */
function maskLiterals(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };

  function quoted(i) {
    const q = source[i];
    let j = i + 1;
    while (j < n) {
      if (source[j] === "\\") { j += 2; continue; }
      if (source[j] === q) break;
      j++;
    }
    blank(i, Math.min(j + 1, n));
    return j + 1;
  }

  /** `${` の直後から、対応する `}` の次までを走る（中は潰さない）。 */
  function interpolation(i) {
    let depth = 0;
    while (i < n) {
      const c = source[i];
      if (c === "}" && depth === 0) return i + 1;
      if (c === "{") { depth++; i++; continue; }
      if (c === "}") { depth--; i++; continue; }
      if (c === '"' || c === "'") { i = quoted(i); continue; }
      if (c === "`") { i = template(i); continue; }
      if (c === "/" && source[i + 1] === "/") {
        const e = source.indexOf("\n", i);
        blank(i, e === -1 ? n : e); i = e === -1 ? n : e; continue;
      }
      if (c === "/" && source[i + 1] === "*") {
        const e = source.indexOf("*/", i + 2);
        blank(i, e === -1 ? n : e + 2); i = e === -1 ? n : e + 2; continue;
      }
      i++;
    }
    return i;
  }

  function template(start) {
    let i = start + 1;
    let chunk = i;
    while (i < n) {
      if (source[i] === "\\") { i += 2; continue; }
      if (source[i] === "`") { blank(chunk, i); return i + 1; }
      if (source[i] === "$" && source[i + 1] === "{") {
        blank(chunk, i);
        i = interpolation(i + 2);
        chunk = i;
        continue;
      }
      i++;
    }
    blank(chunk, n);
    return n;
  }

  let i = 0;
  while (i < n) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      const e = source.indexOf("\n", i);
      blank(i, e === -1 ? n : e); i = e === -1 ? n : e; continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const e = source.indexOf("*/", i + 2);
      blank(i, e === -1 ? n : e + 2); i = e === -1 ? n : e + 2; continue;
    }
    if (c === '"' || c === "'") { i = quoted(i); continue; }
    if (c === "`") { i = template(i); continue; }
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

/** `lib/messages.ts` から入ってくる関数（別名 import を追う）。 */
const LEAF_EXPORTS = new Set(["label", "labelWith", "localizedLabel"]);
const NAMESPACE_EXPORTS = new Set(["labelOptions", "labelKeys"]);

function functionNamesFor(source) {
  const leaf = new Set(["tr", "translate"]);
  const namespace = new Set();
  let importsMessages = false;
  for (const im of source.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g,
  )) {
    if (!/(^|\/)messages$/.test(im[2])) continue;
    importsMessages = true;
    for (const part of im[1].split(",")) {
      const m = /^\s*([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?\s*$/.exec(part);
      if (!m) continue;
      const local = m[2] ?? m[1];
      if (LEAF_EXPORTS.has(m[1])) leaf.add(local);
      if (NAMESPACE_EXPORTS.has(m[1])) namespace.add(local);
    }
  }
  // `const L = (key, fallback, vars) => label(key, "ja", ...)` の類。
  // messages を import しているファイルに限るので、無関係な `L(` は拾わない。
  if (importsMessages && /\b(?:const|function)\s+L\s*[=(]/.test(source)) leaf.add("L");
  return { leaf, namespace };
}

const missing = [];
let checked = 0;

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const { leaf, namespace } = functionNamesFor(source);
  const names = [...leaf, ...namespace];
  if (names.length === 0) continue;
  const masked = maskLiterals(source);
  const rel = path.relative(REPO, file);
  const re = new RegExp(`\\b(${names.join("|")})\\(`, "g");
  let m;
  while ((m = re.exec(masked)) !== null) {
    const open = m.index + m[1].length;
    const close = matchParen(masked, open);
    if (close < 0) continue;
    const commas = topLevelCommas(masked, open + 1, close);
    const arg0End = commas.length > 0 ? commas[0] : close;
    const litValue = literalStringValue(source, open + 1, arg0End);
    re.lastIndex = arg0End;
    if (litValue === null) continue;
    checked++;
    const known = namespace.has(m[1])
      ? namespaceKeys.has(litValue)
      : leafKeys.has(litValue);
    if (!known) {
      const line = source.slice(0, m.index).split("\n").length;
      missing.push({ file: rel, line, key: litValue, fn: m[1] });
    }
  }
}

console.log(`文言の鍵 ${checked} 件を検査`);
if (missing.length === 0) {
  console.log("✓ すべて messages/ja.json に実在します");
  process.exit(0);
}
console.error(`✗ messages/ja.json に無い鍵 ${missing.length} 件:`);
for (const m of missing.slice(0, 30))
  console.error(`  - ${m.file}:${m.line}  ${m.fn}(${JSON.stringify(m.key)})`);
process.exit(1);
