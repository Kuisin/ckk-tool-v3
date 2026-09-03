#!/usr/bin/env node
/**
 * generate-keys.mjs — `tr("日本語")` の 5,815 箇所に next-intl の静的な鍵を割る。
 *
 *   node tools/i18n-unify/scan-tr-calls.mjs > /tmp/tr-calls.json
 *   node tools/i18n-unify/generate-keys.mjs > /tmp/key-map.json
 *
 * ■ 名前空間の決め方
 * ファイルパスの上から 2 階層（`src/components/` `src/app/(dashboard)/`
 * `src/lib/` 等の決まり切った前置きを外した後の最初の 2 segment）を名前空間に
 * する。深すぎると Weblate 上でも 1 画面ぶんの文脈が分散し、浅すぎると
 * 無関係な文言が同じ場所に積み上がる——2 段は両方の折衷。
 *
 *   src/components/sales/quotes/QuoteDetail.tsx        → sales.quotes
 *   src/app/(dashboard)/sales/quotes/[id]/edit/page.tsx → sales.quotes
 *   src/lib/audit.ts                                    → lib.audit
 *   src/hooks/useTr.ts                                  → hooks.useTr
 *
 * ■ 2 つ以上のファイルで使われている文言は `common` へ
 * 「同じ日本語に 2 つの訳が付く」を防ぐための唯一の仕掛け。ja 鍵の辞書が
 * 元々持っていた保証（同じ文字列は必ず同じ訳）を、名前空間に分けたあとも
 * 保つには、複数箇所で使われる文言をどこか 1 か所に集約するしかない。
 * 1 箇所だけの文言はその画面の名前空間に残し、Weblate 上でも文脈のそばに置く。
 *
 * ■ 鍵の作り方
 * 英訳（辞書に既にある）をスラッグ化して camelCase にする。名前空間内で
 * 衝突したら連番を足す。英訳が無ければ ja 自体をローマ字化はせず、
 * 通し番号（`s1`, `s2`, …）にする——無理に英語の見た目を作ると誤解を招く。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

const calls = JSON.parse(fs.readFileSync("/tmp/tr-calls.json", "utf8"));

// ── 既存の対訳（en）を読む ───────────────────────────────────────────────
const dict = {};
const dataDir = path.join(REPO, "tools/i18n/data");
Object.assign(dict, JSON.parse(fs.readFileSync(path.join(dataDir, "seed.json"), "utf8")));
for (const f of fs.readdirSync(path.join(dataDir, "translations"))) {
  if (!f.endsWith(".json")) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dataDir, "translations", f), "utf8"));
  Object.assign(dict, d);
}
function enOf(ja) {
  const v = dict[ja];
  if (!v) return null;
  return Array.isArray(v) ? v[0] : v.en;
}
function zhOf(ja) {
  const v = dict[ja];
  if (!v) return null;
  return Array.isArray(v) ? v[1] : v.zh;
}

// ── 名前空間の決定 ───────────────────────────────────────────────────────
const STRIP_PREFIXES = [
  "coolify/apps/nextjs-web/src/app/(dashboard)/",
  "coolify/apps/nextjs-web/src/app/(auth)/",
  "coolify/apps/nextjs-web/src/app/(portal)/",
  "coolify/apps/nextjs-web/src/app/",
  "coolify/apps/nextjs-web/src/components/",
  "coolify/apps/nextjs-web/src/",
];

function toCamel(segment) {
  return segment
    .replace(/\.(tsx?|jsx?)$/, "")
    .replace(/[-_](\w)/g, (_, c) => c.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function namespaceFor(file) {
  let rel = file;
  for (const p of STRIP_PREFIXES) {
    if (rel.startsWith(p)) {
      rel = rel.slice(p.length);
      break;
    }
  }
  const parts = rel
    .split("/")
    .filter((seg) => seg && !/^\(.*\)$/.test(seg) && !/^\[.*\]$/.test(seg))
    .map(toCamel)
    .filter(Boolean);
  const ns = parts.slice(0, 2);
  if (ns.length === 0) return "misc";
  if (ns.length === 1) return ns[0];
  return ns.join(".");
}

function slugify(text, maxWords = 6) {
  const words = text
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
  if (words.length === 0) return null;
  return words
    .map((w, i) =>
      i === 0 ? w[0].toLowerCase() + w.slice(1) : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("")
    .replace(/^[0-9]/, (c) => `n${c}`); // 数字始まりは識別子にならない
}

// ── ja → files の集計 ────────────────────────────────────────────────────
const byJa = new Map(); // ja -> { files:Set, count, vars: boolean }
for (const c of calls.literal) {
  if (!byJa.has(c.value)) byJa.set(c.value, { files: new Set(), count: 0, hasVars: false });
  const e = byJa.get(c.value);
  e.files.add(c.file);
  e.count++;
  if (c.hasVars) e.hasVars = true;
}

// ── 鍵の割り当て ─────────────────────────────────────────────────────────
const usedKeysPerNamespace = new Map(); // namespace -> Set(leafKey)

// **既存の next-intl 名前空間（common / home / shell / …）と同じ名前を
// 生成側が使うことがある**（`common` はまさにその集約先）。そこにある
// 既存の鍵と同じ英単語スラッグを作ってしまうと、後で木を組むときに
// 「違う日本語なのに同じ鍵」の衝突になる。既存ファイルの直下 1 段を
// 先に「使用済み」として予約しておき、`reserveKey` の連番機構で自然に
// 避けさせる。
{
  const existingJa = JSON.parse(
    fs.readFileSync(path.join(REPO, "coolify/apps/nextjs-web/messages/ja.json"), "utf8"),
  );
  for (const [ns, value] of Object.entries(existingJa)) {
    if (ns === "ui") continue; // これから削る側なので予約しない
    if (!value || typeof value !== "object") continue;
    const leaves = Object.keys(value);
    if (leaves.length > 0) usedKeysPerNamespace.set(ns, new Set(leaves));
  }
}
const jaToFullKey = new Map(); // ja -> "namespace.leafKey"
const namespaceOfLeaf = new Map(); // "namespace.leafKey" -> ja (逆引き・デバッグ用)

function reserveKey(namespace, leaf) {
  if (!usedKeysPerNamespace.has(namespace)) usedKeysPerNamespace.set(namespace, new Set());
  const used = usedKeysPerNamespace.get(namespace);
  let candidate = leaf;
  let n = 2;
  while (used.has(candidate)) candidate = `${leaf}${n++}`;
  used.add(candidate);
  return candidate;
}

let anonCounter = 0;
for (const [ja, info] of byJa) {
  const isShared = info.files.size >= 2;
  const namespace = isShared ? "common" : namespaceFor([...info.files][0]);
  const en = enOf(ja);
  let leaf = en ? slugify(en) : null;
  if (!leaf) leaf = `s${++anonCounter}`;
  const finalLeaf = reserveKey(namespace, leaf);
  const fullKey = `${namespace}.${finalLeaf}`;
  jaToFullKey.set(ja, fullKey);
  namespaceOfLeaf.set(fullKey, ja);
}

// ── 出力 ────────────────────────────────────────────────────────────────
const out = {};
for (const [ja, fullKey] of jaToFullKey) {
  out[ja] = {
    key: fullKey,
    en: enOf(ja) ?? ja,
    zh: zhOf(ja) ?? ja,
    files: [...byJa.get(ja).files],
    shared: byJa.get(ja).files.size >= 2,
  };
}

console.error(`unique ja strings: ${byJa.size}`);
console.error(`namespaces: ${usedKeysPerNamespace.size}`);
console.error(`shared (>=2 files) -> common: ${[...byJa.values()].filter((v) => v.files.size >= 2).length}`);
console.error(`anonymous keys (no en translation): ${anonCounter}`);

process.stdout.write(JSON.stringify(out, null, 2));
