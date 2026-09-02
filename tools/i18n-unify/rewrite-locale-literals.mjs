#!/usr/bin/env node
/**
 * rewrite-locale-literals.mjs — コードに直接書かれた `{ ja: …, en: …, zh: … }` を
 * `localizedLabel("<JSON の道>")` の呼び出しに差し替える。
 *
 *   node tools/i18n-unify/rewrite-locale-literals.mjs --dry
 *   node tools/i18n-unify/rewrite-locale-literals.mjs
 *
 * ■ どの道に差し替えるかの決め方
 * `extract-label-maps.mjs` が同じファイルから吸い出した
 * `{ 道: { ja, en, zh } }` を突き合わせ、**ja の文字列が一致するもの**を探す。
 * ja が同じ行が 2 つ以上あるときは**触らない**（どちらの道か決められないため。
 * 黙って間違った道に差し替えるより、残して人が見るほうがよい）。
 *
 * ■ 呼び出し元は変えない
 * `localizedLabel()` は `{ ja, en, zh }` を返すので、
 * `PERMISSION_GROUP_LABEL[group].ja` のような既存の読み方はそのまま動く。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web");
const dry = process.argv.includes("--dry");

const labelMaps = JSON.parse(
  fs.readFileSync(process.env.LABEL_MAPS ?? "/tmp/label-maps.json", "utf8"),
);

/** 対象ファイル → JSON 名前空間。 */
const TARGETS = [
  { file: "src/lib/permission-labels.ts", namespace: "permission" },
  { file: "src/lib/privileged-operations.ts", namespace: "privilegedOp" },
];

/** `{ ja: "…", en: "…", zh: "…" }` を 1 つ取り出す（入れ子の括弧に耐える）。 */
function findLocaleObjects(source) {
  const out = [];
  const re = /\{\s*ja:\s*(["'`])/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = start;
    let inStr = null;
    for (; i < source.length; i++) {
      const c = source[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const end = i + 1;
    const text = source.slice(start, end);
    // 中身が ja/en/zh の文字列だけ = 訳そのもの
    if (/^\{\s*(?:ja|en|zh)\s*:/.test(text) && !/\{\s*[a-zA-Z_$][\w$]*\s*:\s*\{/.test(text.slice(1))) {
      out.push({ start, end, text });
    }
    re.lastIndex = end;
  }
  return out;
}

/** その JS オブジェクト片から ja の値を読む（評価せず、素朴に）。 */
function jaValueOf(text) {
  const m = /ja:\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1/.exec(text);
  if (!m) return null;
  // エスケープを実際の文字へ（辞書側の値と突き合わせるため）
  return m[2]
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\`/g, "`")
    .replace(/\\\\/g, "\\");
}

let totalReplaced = 0;
let totalSkipped = 0;

for (const target of TARGETS) {
  const abs = path.join(WEB, target.file);
  const entries = labelMaps[target.namespace]?.entries ?? {};

  // ja の値 → 道（一意なものだけ）
  const byJa = new Map();
  for (const [dotted, leaf] of Object.entries(entries)) {
    const ja = leaf.ja;
    if (byJa.has(ja)) byJa.set(ja, null); // 重複は使わない
    else byJa.set(ja, dotted);
  }

  let source = fs.readFileSync(abs, "utf8");
  const objects = findLocaleObjects(source);
  let replaced = 0;
  let skipped = 0;

  // 後ろから当てる（位置がずれないように）
  for (const obj of objects.slice().reverse()) {
    const ja = jaValueOf(obj.text);
    if (ja == null) { skipped++; continue; }
    const dotted = byJa.get(ja);
    if (!dotted) { skipped++; continue; }
    const call = `localizedLabel("${target.namespace}.${dotted}")`;
    source = source.slice(0, obj.start) + call + source.slice(obj.end);
    replaced++;
  }

  if (replaced > 0 && !/from "\.\/messages"/.test(source)) {
    source = source.replace(
      /^(import .*?from "[^"]*";)/m,
      `$1\nimport { localizedLabel } from "./messages";`,
    );
  }

  console.log(`${target.file}: 置換 ${replaced} / 見送り ${skipped}`);
  totalReplaced += replaced;
  totalSkipped += skipped;
  if (!dry) fs.writeFileSync(abs, source);
}

console.log(`\n${dry ? "[dry] " : ""}合計 置換 ${totalReplaced} / 見送り ${totalSkipped}`);
