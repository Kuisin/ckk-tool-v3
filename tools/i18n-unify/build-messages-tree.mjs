#!/usr/bin/env node
/**
 * build-messages-tree.mjs — `key-map.json` から messages/*.json を組み立て直す。
 *
 *   node tools/i18n-unify/build-messages-tree.mjs
 *
 * 既存の `common` / `shell` / `preferences` / `home` / `loginHistory`
 * （変数を含む next-intl の文）と `enum` / `status` / `permission` /
 * `privilegedOp` / `pdf`（値ラベル）はそのまま残す。**`ui`（旧 ja 鍵の
 * 決まり文句）だけを削り**、`key-map.json` が決めた本物の next-intl 鍵の
 * 木で置き換える。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const MESSAGES = path.join(REPO, "coolify/apps/nextjs-web/messages");

const keyMap = JSON.parse(fs.readFileSync("/tmp/key-map.json", "utf8"));

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

const LOCALES = ["ja", "en", "zh"];
const trees = {};
for (const loc of LOCALES) trees[loc] = {};

for (const [ja, info] of Object.entries(keyMap)) {
  setPath(trees.ja, info.key, ja);
  setPath(trees.en, info.key, info.en);
  setPath(trees.zh, info.key, info.zh);
}

/**
 * 深いマージ。**衝突したら例外を投げる**——同じ鍵に 2 つの値が来るのは
 * 名前空間の割り当てにバグがあるということで、黙って片方を捨てるより
 * 早く気づけたほうがよい。`common` / `home` は生成した名前空間と既存の
 * next-intl 名前空間が同じ名前を共有する（意図どおり——`common` は
 * 「2 箇所以上で使われる文言」の集約先そのもの）ので、そこだけは
 * オブジェクト同士を merge し、既存の鍵は保つ。
 */
function deepMergeNoOverwrite(base, incoming, pathSoFar = "") {
  for (const [k, v] of Object.entries(incoming)) {
    const p = pathSoFar ? `${pathSoFar}.${k}` : k;
    if (!(k in base)) {
      base[k] = v;
      continue;
    }
    const existingIsObj = base[k] && typeof base[k] === "object";
    const incomingIsObj = v && typeof v === "object";
    if (existingIsObj && incomingIsObj) {
      deepMergeNoOverwrite(base[k], v, p);
    } else if (existingIsObj !== incomingIsObj) {
      throw new Error(`鍵 "${p}" が既存では${existingIsObj ? "グループ" : "文言"}、生成側では${incomingIsObj ? "グループ" : "文言"} — 衝突`);
    } else if (base[k] !== v) {
      throw new Error(`鍵 "${p}" が重複: 既存="${base[k]}" 生成="${v}"`);
    }
  }
  return base;
}

for (const loc of LOCALES) {
  const existing = JSON.parse(fs.readFileSync(path.join(MESSAGES, `${loc}.json`), "utf8"));
  delete existing.ui; // 旧・平らな ja 鍵の決まり文句を除去
  const merged = deepMergeNoOverwrite(existing, trees[loc]);
  fs.writeFileSync(path.join(MESSAGES, `${loc}.json`), `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`messages/${loc}.json  名前空間 ${Object.keys(merged).length}`);
}

// 突き合わせ: 3 言語で鍵の集合が完全一致していること。
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
  sets[loc] = keyPaths(JSON.parse(fs.readFileSync(path.join(MESSAGES, `${loc}.json`), "utf8")), "", new Set());
}
let ok = true;
for (const loc of LOCALES.slice(1)) {
  const missing = [...sets.ja].filter((k) => !sets[loc].has(k));
  const extra = [...sets[loc]].filter((k) => !sets.ja.has(k));
  if (missing.length || extra.length) {
    ok = false;
    console.error(`✗ ${loc}: 無い ${missing.length} / 余分 ${extra.length}`);
  }
}
console.log(ok ? `✓ 鍵 ${sets.ja.size} 件、3 言語で完全一致` : "✗ 不一致");
process.exit(ok ? 0 : 1);
