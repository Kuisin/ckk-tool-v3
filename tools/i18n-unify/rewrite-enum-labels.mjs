#!/usr/bin/env node
/**
 * rewrite-enum-labels.mjs — `lib/enum-labels.ts` から**訳の実体を抜き**、
 * `messages/<locale>.json` を引くだけの形にする。
 *
 *   node tools/i18n-unify/rewrite-enum-labels.mjs --dry
 *   node tools/i18n-unify/rewrite-enum-labels.mjs
 *
 * ■ 何を変えて、何を変えないか
 * **公開している関数の形（`xxxLabel(value, locale)` / `xxxOptions(locale)`）は
 * 一切変えない。** 呼び出し元が 120 箇所以上あるので、そこを触らずに中身だけ
 * 差し替える。変わるのは 2 つの内部ヘルパーの引数だけ:
 *
 *   resolveLabel(UNIT_LABEL, value, locale)  →  resolveLabel("UNIT_LABEL", value, locale)
 *   labelOptions(UNIT_LABEL, locale)         →  labelOptions("UNIT_LABEL", locale)
 *
 * 表の実体（`const UNIT_LABEL: LabelMap = {…}`）はファイルごと削る。
 * 同じ内容は `messages/<locale>.json` の `enum.UNIT_LABEL.*` に入っている。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const FILE = path.join(REPO, "coolify/apps/nextjs-web/src/lib/enum-labels.ts");
const dry = process.argv.includes("--dry");

let source = fs.readFileSync(FILE, "utf8");

// ── 1. 内部ヘルパーを、JSON を引く形へ置き換える ───────────────────────────
const OLD_HELPERS = `type LabelMap = Record<string, Record<Locale, string>>;

function resolveLabel(map: LabelMap, value: string, locale: Locale): string {
  return map[value]?.[locale] ?? map[value]?.ja ?? value;
}

function labelOptions(
  map: LabelMap,
  locale: Locale,
): { value: string; label: string }[] {
  return Object.entries(map).map(([value, l]) => ({
    value,
    label: l[locale] ?? l.ja,
  }));
}`;

const NEW_HELPERS = `/**
 * 表の名前（\`UNIT_LABEL\` など）で \`messages/<locale>.json\` の
 * \`enum.<表の名前>.<値>\` を引く。訳が無ければ ja、それも無ければ値そのもの。
 */
function resolveLabel(map: string, value: string, locale: Locale): string {
  return label(\`enum.\${map}.\${value}\`, locale, value);
}

function labelOptions(
  map: string,
  locale: Locale,
): { value: string; label: string }[] {
  return messageLabelOptions(\`enum.\${map}\`, locale);
}`;

if (!source.includes(OLD_HELPERS)) {
  console.error("✗ ヘルパーの形が想定と違う。手で確認すること。");
  process.exit(1);
}
source = source.replace(OLD_HELPERS, NEW_HELPERS);

// import を足す
source = source.replace(
  'import type { Locale } from "./i18n";',
  'import type { Locale } from "./i18n";\nimport { label, labelOptions as messageLabelOptions } from "./messages";',
);

// ── 2. 呼び出しの第 1 引数を文字列にする ───────────────────────────────────
let callsRewritten = 0;
source = source.replace(
  /\b(resolveLabel|labelOptions)\(\s*([A-Z][A-Z0-9_]*)\s*,/g,
  (_m, fn, mapName) => {
    callsRewritten++;
    return `${fn}("${mapName}",`;
  },
);

// ── 3. 表の実体を削る ──────────────────────────────────────────────────────
/** `const NAME: LabelMap = {` から対応する `};` までを取り除く。 */
function dropMapDeclarations(src) {
  let out = src;
  let removed = 0;
  for (;;) {
    const m = /^const\s+([A-Z][A-Z0-9_]*)\s*:\s*LabelMap\s*=\s*\{/m.exec(out);
    if (!m) break;
    const start = m.index;
    // 対応する閉じ括弧を数える（値に `{}` は出てこないが、念のため数える）
    let i = out.indexOf("{", start);
    let depth = 0;
    for (; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    // `};` と、その後ろの改行までを含めて落とす
    let end = i + 1;
    if (out[end] === ";") end++;
    while (out[end] === "\n") end++;
    // 直前に付いている JSDoc / 行コメントも一緒に落とす
    // **直前に接している JSDoc だけ**を落とす。`[\s\S]*?` で書くと
    // ファイル冒頭の説明コメントから一気に飲み込んでしまう（実際にやった）。
    // 「中に `*/` を含まない」= 直近の 1 ブロックだけ、と書くのが正しい。
    let realStart = start;
    const before = out.slice(0, start);
    const commentMatch = /\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/.exec(before);
    if (commentMatch) realStart = commentMatch.index;
    out = out.slice(0, realStart) + out.slice(end);
    removed++;
  }
  return { out, removed };
}

const { out, removed } = dropMapDeclarations(source);
source = out;

// 連続した空行を 1 つに詰める
source = source.replace(/\n{3,}/g, "\n\n");

console.log(`置換した呼び出し: ${callsRewritten}`);
console.log(`削った表:         ${removed}`);
console.log(`行数:             ${fs.readFileSync(FILE, "utf8").split("\n").length} → ${source.split("\n").length}`);

if (dry) {
  console.log("\n[dry] 書き込んでいない");
} else {
  fs.writeFileSync(FILE, source);
  console.log("\n書き込んだ:", path.relative(REPO, FILE));
}
