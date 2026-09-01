#!/usr/bin/env node
/**
 * i18n-todo.mjs — まだ訳していない日本語を、訳す単位で並べる。
 *
 *   node tools/i18n/i18n-todo.mjs            # 残り件数の内訳
 *   node tools/i18n/i18n-todo.mjs --next 300 # 次に訳す 300 語（1 行 1 語の JSON 文字列）
 *   node tools/i18n/i18n-todo.mjs --templates # ICU へ移す必要があるテンプレート断片
 *
 * `i18n-scan.mjs` が「画面に残っている日本語の**箇所**」を数えるのに対し、
 * こちらは「まだ訳が無い**語**」を出す。箇所は 1 万を超えるが語は重複を
 * 畳むのでずっと少なく、訳す作業の単位はこちら。
 *
 * 出さないもの:
 *   - 既に辞書にある語（data/seed.json + data/translations/*.json）
 *   - data/ambiguous.json … 文脈で意味が変わる語。型付きの表に任せる
 *   - data/skip.json      … 固有名詞・見本データ（用語集 §1 で対象外）
 *   - テンプレート断片    … `${}` を挟んだ文の断片。ICU 行き（--templates で見る）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanDir } from "./lib/scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DATA = path.join(HERE, "data");

const json = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const known = new Set(Object.keys(json(path.join(DATA, "seed.json"))));
for (const f of fs.readdirSync(path.join(DATA, "translations"))) {
  if (!f.endsWith(".json")) continue;
  for (const k of Object.keys(json(path.join(DATA, "translations", f))))
    known.add(k);
}
const ambiguous = new Set(json(path.join(DATA, "ambiguous.json")));
const skip = new Set(json(path.join(DATA, "skip.json")).items);

const map = new Map();
for (const rel of [
  "coolify/apps/nextjs-web/src",
  "coolify/apps/nextjs-kiosk/src",
]) {
  for (const f of scanDir(path.join(REPO, rel))) {
    if (!map.has(f.text))
      map.set(f.text, {
        n: 0,
        kinds: new Set(),
        file: path.relative(REPO, f.file),
      });
    const e = map.get(f.text);
    e.n++;
    e.kinds.add(f.kind);
  }
}

const todo = [];
const templates = [];
const counts = { known: 0, ambiguous: 0, skip: 0 };

for (const [text, e] of map) {
  if (known.has(text)) {
    counts.known++;
    continue;
  }
  if (ambiguous.has(text)) {
    counts.ambiguous++;
    continue;
  }
  if (skip.has(text)) {
    counts.skip++;
    continue;
  }
  // 断片としてしか現れない語は ICU 行き（用語集 §2.6）。
  if (
    e.kinds.has("template") &&
    !e.kinds.has("string") &&
    !e.kinds.has("jsx")
  ) {
    templates.push({ text, n: e.n, file: e.file });
    continue;
  }
  todo.push({ text, n: e.n, file: e.file });
}

todo.sort((a, b) => b.n - a.n || a.text.length - b.text.length);
templates.sort((a, b) => b.n - a.n);

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes("--templates")) {
  for (const t of templates.slice(0, Number(valueOf("--templates") ?? 200)))
    console.log(`${String(t.n).padStart(4)}  ${JSON.stringify(t.text)}  ${t.file}`);
  console.error(`\ntemplate fragments: ${templates.length}`);
  process.exit(0);
}

if (argv.includes("--next")) {
  for (const t of todo.slice(0, Number(valueOf("--next") ?? 200)))
    console.log(JSON.stringify(t.text));
  console.error(`remaining ${todo.length}`);
  process.exit(0);
}

console.log(`辞書にある語        ${counts.known}`);
console.log(`文脈依存（型付き表） ${counts.ambiguous}`);
console.log(`対象外（固有名詞）   ${counts.skip}`);
console.log(`テンプレート断片     ${templates.length}  (ICU へ)`);
console.log(`まだ訳していない語   ${todo.length}`);
