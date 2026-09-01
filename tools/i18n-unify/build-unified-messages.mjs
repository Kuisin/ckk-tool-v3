#!/usr/bin/env node
/**
 * build-unified-messages.mjs — 3 つに散っていた文言を
 * `messages/{ja,en,zh}.json` の 1 本にまとめる。
 *
 *   node --experimental-strip-types tools/i18n-unify/extract-label-maps.mjs > /tmp/label-maps.json
 *   node tools/i18n-unify/build-unified-messages.mjs
 *
 * ■ まとめる前（3 か所）
 *   1. `messages/*.json`                       … next-intl（変数を含む文）
 *   2. `Record<Locale, string>`（コードの中）   … enum・状態・権限などの値ラベル
 *   3. `tools/i18n/data/translations/*.json`   … ja を鍵にした決まり文句 6,241 語
 *
 * ■ まとめた後（1 本）
 *   messages/<locale>.json
 *     ├ common / shell / preferences / …   既存の next-intl 名前空間（入れ子・ICU）
 *     ├ enum / status / permission / …     コードから吸い出した値ラベル（入れ子）
 *     └ ui                                 ja を鍵にした決まり文句（**平ら**）
 *
 * ■ `ui` だけ平らにする理由
 * 鍵が日本語の原文そのもので、44 件は `直径は 0.1〜99.9mm…` のように **`.` を含む**。
 * next-intl の `t("a.b")` は `.` を入れ子の区切りとして読むので、入れ子に置くと
 * 引けなくなる。`ui` は `tr()` が**直接プロパティを引く**（`t()` を通さない）ので
 * 平らなままで正しく、しかも `.` も改行も安全に持てる。
 *
 * ついでに ICU も通らないので、`^[A-Z]{2}-d{4}$` のような**正規表現の例**が
 * ICU の引数と誤読される事故も起きない（1 件だけ実在する）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web");
const MESSAGES = path.join(WEB, "messages");
const LABEL_MAPS = process.argv[2] ?? "/tmp/label-maps.json";

const LOCALES = ["ja", "en", "zh"];

// ── 1. 既存の next-intl カタログ ────────────────────────────────────────────
const existing = {};
for (const loc of LOCALES) {
  existing[loc] = JSON.parse(
    fs.readFileSync(path.join(MESSAGES, `${loc}.json`), "utf8"),
  );
}

// ── 2. コードから吸い出した値ラベル ─────────────────────────────────────────
const labelMaps = JSON.parse(fs.readFileSync(LABEL_MAPS, "utf8"));

/** `a.b.c` の道に値を置く（入れ子オブジェクトを作りながら）。 */
function setPath(root, dotted, value) {
  const parts = dotted.split(".");
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[parts.at(-1)] = value;
}

const labelTrees = {};
for (const loc of LOCALES) labelTrees[loc] = {};

for (const [namespace, { entries }] of Object.entries(labelMaps)) {
  for (const [dotted, byLocale] of Object.entries(entries)) {
    for (const loc of LOCALES) {
      // 訳が無い言語は **ja へ倒す**（既存の resolveLabel と同じ振る舞い）。
      const value = byLocale[loc] ?? byLocale.ja;
      setPath(labelTrees[loc], `${namespace}.${dotted}`, value);
    }
  }
}

// ── 3. ja を鍵にした決まり文句 ──────────────────────────────────────────────
const dict = {};
const dataDir = path.join(REPO, "tools/i18n/data");
Object.assign(dict, JSON.parse(fs.readFileSync(path.join(dataDir, "seed.json"), "utf8")));
for (const f of fs.readdirSync(path.join(dataDir, "translations"))) {
  if (f.endsWith(".json")) {
    Object.assign(
      dict,
      JSON.parse(fs.readFileSync(path.join(dataDir, "translations", f), "utf8")),
    );
  }
}

const ui = {};
for (const loc of LOCALES) ui[loc] = {};
for (const [ja, pair] of Object.entries(dict)) {
  // **2 つの書き方が混在している。** `seed.json` は `{ en, zh }`、
  // `translations/*.json` は `[en, zh]`。どちらも読む
  // （片方だけ対応していて、訳がオブジェクトのまま JSON に入り込んでいた）。
  const en = Array.isArray(pair) ? pair[0] : pair?.en;
  const zh = Array.isArray(pair) ? pair[1] : pair?.zh;
  ui.ja[ja] = ja; // ja は恒等。Weblate に原文を見せるため**明示的に**持つ
  ui.en[ja] = en || ja;
  ui.zh[ja] = zh || ja;
}

// ── 書き出し ────────────────────────────────────────────────────────────────
let written = 0;
for (const loc of LOCALES) {
  const merged = {
    ...existing[loc],
    ...labelTrees[loc],
    ui: ui[loc],
  };
  fs.writeFileSync(
    path.join(MESSAGES, `${loc}.json`),
    `${JSON.stringify(merged, null, 2)}\n`,
  );
  const top = Object.keys(merged).length;
  console.log(`messages/${loc}.json  名前空間 ${top} / ui ${Object.keys(ui[loc]).length} 語`);
  written++;
}

// 突き合わせ: 3 言語で鍵の集合が完全に一致していること。
function keyPaths(node, prefix, out) {
  for (const [k, v] of Object.entries(node)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) keyPaths(v, p, out);
    else out.add(p);
  }
  return out;
}
const sets = {};
for (const loc of LOCALES) {
  const merged = JSON.parse(
    fs.readFileSync(path.join(MESSAGES, `${loc}.json`), "utf8"),
  );
  sets[loc] = keyPaths(merged, "", new Set());
}
let mismatch = 0;
for (const loc of LOCALES.slice(1)) {
  const missing = [...sets.ja].filter((k) => !sets[loc].has(k));
  const extra = [...sets[loc]].filter((k) => !sets.ja.has(k));
  if (missing.length || extra.length) {
    mismatch++;
    console.error(`✗ ${loc}: ja に有って無い ${missing.length} / ja に無いのに有る ${extra.length}`);
    for (const k of missing.slice(0, 5)) console.error(`    missing: ${k}`);
    for (const k of extra.slice(0, 5)) console.error(`    extra:   ${k}`);
  }
}
console.log(
  mismatch === 0
    ? `✓ ${written} ファイル / 鍵 ${sets.ja.size} 件、3 言語で完全一致`
    : "✗ 鍵の集合が食い違っています",
);
process.exit(mismatch === 0 ? 0 : 1);
