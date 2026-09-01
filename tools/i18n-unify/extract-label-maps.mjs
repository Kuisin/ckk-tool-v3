#!/usr/bin/env node
/**
 * extract-label-maps.mjs — コードの中に埋まっている `Record<Locale, string>` を
 * 吸い出して、言語ごとの JSON へ移すための下ごしらえ。
 *
 *   node tools/i18n-unify/extract-label-maps.mjs > /tmp/label-maps.json
 *
 * ■ なぜ「実行して読む」のか
 * これらの表は**わざと export していない**（`lib/enum-labels.ts` の冒頭に理由が
 * ある — locale 無しで引ける口を作らないため）。正規表現で読み取ることもできるが、
 * 対象は 446 行ぶんの入れ子オブジェクトで、1 つ読み違えても気づけない。
 * Node 22 の型ストリップ（--experimental-strip-types）で **本物の TS を
 * そのまま評価**し、モジュールの実際の値を読む。読み違いが起こりえない。
 *
 * ソースには手を入れない。`const X: LabelMap = {...}` を
 * `export const X` へ**写しの上で**書き換えたものを一時ファイルに置いて読む。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web");

/**
 * 吸い出す対象。`namespace` が messages JSON でのまとまりの名前になる。
 * `only` があるときは、その名前の const だけを採る（ファイルには翻訳以外の
 * 定数も混ざっているため）。
 */
const TARGETS = [
  { file: "src/lib/enum-labels.ts", namespace: "enum" },
  { file: "src/lib/status-map.ts", namespace: "status" },
  { file: "src/lib/permission-labels.ts", namespace: "permission" },
  { file: "src/lib/privileged-operations.ts", namespace: "privilegedOp" },
  { file: "src/lib/pdf-labels.ts", namespace: "pdf" },
];

/** すべてのトップレベル `const` を export に変えた写しを作る。 */
function exportAllTopLevelConsts(source) {
  // 行頭の `const NAME` だけを対象にする（インデントされた内側の const は触らない）。
  return source.replace(/^const\s+([A-Za-z_$][\w$]*)/gm, "export const $1");
}

const LOCALE_KEY = /^[a-z]{2}(-[A-Za-z]+)?$/;

/** キーがすべて言語コードか（`{ ja: …, en: …, zh: … }`）。 */
function isLocaleKeyed(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.includes("ja") && keys.every((k) => LOCALE_KEY.test(k));
}

/** `{ ja: "…", en: "…" }` — 訳そのもの。 */
function isLocaleLeaf(value) {
  return isLocaleKeyed(value)
    && Object.values(value).every((v) => typeof v === "string");
}

/**
 * `{ ja: {…}, en: {…}, zh: {…} }` — **言語が外側**の形（lib/pdf-labels.ts）。
 * 内側の同じ道をたどって `{ 道: { ja, en, zh } }` へ**転置**する。
 */
function isLocaleOuter(value) {
  return isLocaleKeyed(value)
    && Object.values(value).every(
      (v) => v && typeof v === "object" && !Array.isArray(v),
    );
}

/** 配列の要素を指す**安定した名前**。番号で引くと並べ替えで訳がずれる。 */
function stableId(item, index) {
  if (item && typeof item === "object") {
    for (const field of ["key", "code", "id", "name"]) {
      if (typeof item[field] === "string" && item[field]) return item[field];
    }
  }
  return `#${index}`; // 名前が無い配列は移行対象にしない（下で弾く）
}

/**
 * 任意の入れ子から「訳の葉」だけを拾って
 * `{ '<dotted.path>': { ja, en, zh } }` にする。
 *
 * 3 つの形を扱う:
 *   1. `{ code: { ja, en, zh } }`              … そのまま
 *   2. `[{ key, label: {…}, summary: {…} }]`   … key で引く（**番号では引かない**）
 *   3. `{ ja: {…}, en: {…}, zh: {…} }`         … 言語が外側。転置する
 */
function harvest(node, prefix, out) {
  if (isLocaleLeaf(node)) {
    if (prefix) out[prefix] = node;
    return;
  }

  // 言語が外側 — 各言語の同じ道を歩いて 1 つの葉にまとめ直す。
  if (isLocaleOuter(node)) {
    const locales = Object.keys(node);
    const paths = new Set();
    for (const loc of locales) {
      const flat = {};
      flattenStrings(node[loc], "", flat);
      for (const k of Object.keys(flat)) paths.add(k);
    }
    for (const p of paths) {
      const leaf = {};
      for (const loc of locales) {
        const flat = {};
        flattenStrings(node[loc], "", flat);
        if (typeof flat[p] === "string") leaf[loc] = flat[p];
      }
      if (leaf.ja !== undefined) out[prefix ? `${prefix}.${p}` : p] = leaf;
    }
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      const id = stableId(item, i);
      if (id.startsWith("#")) return; // 安定した名前が無いものは採らない
      harvest(item, prefix ? `${prefix}.${id}` : id, out);
    });
    return;
  }

  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    harvest(value, prefix ? `${prefix}.${key}` : key, out);
  }
}

/** 入れ子オブジェクトの文字列だけを `{ 'a.b': "…" }` に潰す。 */
function flattenStrings(node, prefix, out) {
  if (typeof node === "string") {
    if (prefix) out[prefix] = node;
    return;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  for (const [k, v] of Object.entries(node)) {
    flattenStrings(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

const result = {};

for (const target of TARGETS) {
  const abs = path.join(WEB, target.file);
  if (!fs.existsSync(abs)) {
    console.error(`skip (not found): ${target.file}`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");
  // import の相対パスが崩れないよう、**同じディレクトリに**一時ファイルを置く。
  const tmp = path.join(
    path.dirname(abs),
    `.__i18n_extract_${path.basename(abs)}`,
  );
  fs.writeFileSync(tmp, exportAllTopLevelConsts(source));
  try {
    const mod = await import(`file://${tmp}`);
    const harvested = {};
    for (const [name, value] of Object.entries(mod)) {
      if (typeof value === "function") continue;
      // **const 名を道の頭に必ず付ける。** 付けないと、別の表の同じキー
      // （`DRAFT` が複数の状態表にある等）が同じ道になって上書きし、
      // 黙って訳が消える（実際に enum-labels で 12 件消えていた）。
      harvest(value, name, harvested);
    }
    result[target.namespace] = { file: target.file, entries: harvested };
    console.error(
      `${target.file}  →  ${target.namespace}  (${Object.keys(harvested).length} 件)`,
    );
  } catch (err) {
    console.error(`FAILED ${target.file}: ${err.message}`);
    result[target.namespace] = { file: target.file, entries: {}, error: String(err.message) };
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

process.stdout.write(JSON.stringify(result, null, 2));
