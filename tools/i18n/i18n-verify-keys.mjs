#!/usr/bin/env node
/**
 * i18n-verify-keys.mjs — `tr("…")` の鍵が辞書に有るかを見る。
 *
 *   node tools/i18n/i18n-verify-keys.mjs
 *
 * ja 鍵の対訳は **辞書に無ければ日本語をそのまま返す**（src/lib/ui-text.ts）。
 * 壊れないのが利点だが、裏返すと **綴り違いや訳の消し忘れが静かに日本語のまま
 * 出る**。走査（i18n-scan）は「包まれているか」しか見ないので、包まれた後の
 * 抜けはここでしか捕まらない。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXCLUDED, tokenize } from "./lib/scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const DATA = path.join(HERE, "data");

const dict = {};
Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "seed.json"), "utf8")));
for (const f of fs.readdirSync(path.join(DATA, "translations")))
  if (f.endsWith(".json"))
    Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "translations", f), "utf8")));
for (const k of JSON.parse(fs.readFileSync(path.join(DATA, "ambiguous.json"), "utf8"))) delete dict[k];

const missing = [];
let checked = 0;

const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (EXCLUDED.some((re) => re.test(full))) continue;
    if (e.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    const source = fs.readFileSync(full, "utf8");
    if (!source.includes("tr(")) continue;
    for (const t of tokenize(source)) {
      if (t.quote === "`") continue;
      const before = source.slice(Math.max(0, t.start - 12), t.start);
      if (!/\b(?:tr|translate)\(\s*$/.test(before)) continue;
      checked++;
      if (!Object.hasOwn(dict, t.value))
        missing.push(`${path.relative(REPO, full)}:${t.line}  ${JSON.stringify(t.value)}`);
    }
  }
};
for (const rel of ["coolify/apps/nextjs-web/src", "coolify/apps/nextjs-kiosk/src"])
  walk(path.join(REPO, rel));

console.log(`tr() の鍵 ${checked} 件を検査`);
if (missing.length > 0) {
  console.error(`\n✗ 辞書に無い鍵 ${missing.length} 件（英語・中国語で日本語のまま出ます）:`);
  for (const m of missing.slice(0, 40)) console.error("  -", m);
  if (missing.length > 40) console.error(`  … 他 ${missing.length - 40} 件`);
  process.exit(1);
}
console.log("✓ すべて辞書にあります");
