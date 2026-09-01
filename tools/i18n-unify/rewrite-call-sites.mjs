#!/usr/bin/env node
/**
 * rewrite-call-sites.mjs — `tr("日本語")` を `tr("生成した鍵")` へ、
 * `useTr()`/`getTr()` を next-intl 本物の `useTranslations()`/`getTranslations()`
 * へ差し替える。
 *
 *   node tools/i18n-unify/generate-keys.mjs > /tmp/key-map.json
 *   node tools/i18n-unify/rewrite-call-sites.mjs --dry
 *   node tools/i18n-unify/rewrite-call-sites.mjs
 *
 * ■ 変数名は変えない
 * ローカル変数の名前はずっと `tr` のまま——`useTr()` を `useTranslations()`
 * （名前空間なし = 木全体を「.」区切りの鍵で引ける）に**差し替えるだけ**。
 * これで 5,815 箇所の呼び出し自体（`tr(...)`）に一切触れずに済み、
 * 変えるのは各呼び出しの**引数**（日本語 → 鍵）と、フックの宣言・import の
 * 2 行だけになる。
 *
 * ■ 動的な呼び出し（`tr(result.error)` 等）はここでは触らない
 * 静的な鍵しか引けない next-intl にとって、実行時の文字列を鍵として渡すのは
 * 意味を成さない（辞書に無い鍵として MISSING_MESSAGE になり、原文ではなく
 * 診断用の文字列が出る——訳されないより悪い）。この道具は**リテラル引数だけ**
 * を書き換え、動的な呼び出しは `unwrap-dynamic-calls.mjs` が別に剥がす。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web/src");
const dry = process.argv.includes("--dry");

const keyMap = JSON.parse(fs.readFileSync("/tmp/key-map.json", "utf8"));
const jaToKey = new Map(Object.entries(keyMap).map(([ja, v]) => [ja, v.key]));

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
  return m[2].replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\`/g, "`").replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

let filesChanged = 0;
let callsRewritten = 0;
let missingKey = 0;
const missingSamples = [];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  const masked = maskLiterals(source);
  const rel = path.relative(REPO, file);

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
    if (litValue !== null) {
      const key = jaToKey.get(litValue);
      if (!key) {
        missingKey++;
        if (missingSamples.length < 10) missingSamples.push({ file: rel, value: litValue });
      } else {
        // 元のトークンの正確な範囲（前後の空白を除く）を引用符ごと置換する。
        const argText = source.slice(open + 1, arg0End);
        const leadWs = argText.length - argText.trimStart().length;
        const trailWs = argText.length - argText.trimEnd().length;
        const litStart = open + 1 + leadWs;
        const litEnd = arg0End - trailWs;
        edits.push({ start: litStart, end: litEnd, text: JSON.stringify(key) });
      }
    }
    // ★ 外側の呼び出しの**閉じ括弧まで**丸ごと飛ばすと、vars 引数の中に
    // ある入れ子の tr(...)（`v2: enabled ? tr("表示") : tr("非表示")` のような
    // 形）を見つけられなくなる。第 1 引数の終わりまでだけ飛ばし、
    // vars 引数の中も引き続き探せるようにする。
    re.lastIndex = arg0End;
  }

  if (edits.length === 0) continue;

  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) source = source.slice(0, e.start) + e.text + source.slice(e.end);
  callsRewritten += edits.length;

  // フックの宣言と import を next-intl 本物へ差し替える。
  //
  // ★ **`.replace()` は最初の 1 件しか置換しない。** 同じファイルに
  // リスト用・モーダル用のように**コンポーネントが 2 つ**あると、片方の
  // `const tr = useTr();` だけ直って、もう片方は `useTr` が未定義のまま
  // 残っていた（実際に踏んだ）。`.replaceAll()` を使うこと。
  //
  // ★ **`useTranslations` を既に import している**（`useLocale` などと
  // 一緒に）ファイルがある。そこへもう一度 `import { useTranslations }` を
  // 足すと重複 import になるので、無ければ足す・あれば触らない、で判定する。
  let touchedHook = false;
  const alreadyHasUseTranslationsImport = /from\s*["']next-intl["']/.test(source)
    && /\buseTranslations\b/.test(source.match(/import\s*\{[^}]*\}\s*from\s*["']next-intl["']/)?.[0] ?? "");
  if (source.includes("const tr = useTr();")) {
    source = source.replaceAll("const tr = useTr();", "const tr = useTranslations();");
    if (alreadyHasUseTranslationsImport) {
      source = source.replace(/import\s*\{\s*useTr\s*\}\s*from\s*["']@\/hooks\/useTr["'];\n/, "");
    } else {
      source = source.replace(
        /import\s*\{\s*useTr\s*\}\s*from\s*["']@\/hooks\/useTr["'];\n/,
        'import { useTranslations } from "next-intl";\n',
      );
    }
    touchedHook = true;
  }
  const alreadyHasGetTranslationsImport = /from\s*["']next-intl\/server["']/.test(source)
    && /\bgetTranslations\b/.test(source.match(/import\s*\{[^}]*\}\s*from\s*["']next-intl\/server["']/)?.[0] ?? "");
  if (source.includes("const tr = await getTr();")) {
    source = source.replaceAll("const tr = await getTr();", "const tr = await getTranslations();");
    if (alreadyHasGetTranslationsImport) {
      source = source.replace(/import\s*\{\s*getTr\s*\}\s*from\s*["']@\/lib\/ui-text-server["'];\n/, "");
    } else {
      source = source.replace(
        /import\s*\{\s*getTr\s*\}\s*from\s*["']@\/lib\/ui-text-server["'];\n/,
        'import { getTranslations } from "next-intl/server";\n',
      );
    }
    touchedHook = true;
  }

  filesChanged++;
  if (!dry) fs.writeFileSync(file, source);
  else if (!touchedHook && (source.includes("useTr()") || source.includes("getTr()"))) {
    console.log(`  [warn] ${rel}: tr() 呼び出しはあるがフック宣言の形が想定と違う`);
  }
}

console.log(`\n${dry ? "[dry] " : ""}files ${filesChanged}, calls rewritten ${callsRewritten}, missing keys ${missingKey}`);
if (missingKey > 0) {
  console.log("missing key samples:");
  for (const s of missingSamples) console.log(`  ${s.file}: ${JSON.stringify(s.value.slice(0, 60))}`);
}
