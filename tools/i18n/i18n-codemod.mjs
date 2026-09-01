#!/usr/bin/env node
/**
 * i18n-codemod.mjs — 辞書に載っている日本語のリテラルを `tr("…")` へ包む。
 *
 *   node tools/i18n/i18n-codemod.mjs --area components/billing --dry
 *   node tools/i18n/i18n-codemod.mjs --area components/billing
 *
 * 触るのは**辞書に載っている語だけ**。仕組みと「なぜフックを外側の関数へ
 * 入れるのか」は lib/codemod.mjs の冒頭。
 *
 * 当てたあとは必ず `pnpm exec tsc --noEmit` を通すこと — フックの入れ先を
 * 取り違えた場合、`tr` が未定義として**型検査で落ちる**ので、そこが唯一の
 * 検出口になる。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "./lib/codemod.mjs";
import { EXCLUDED } from "./lib/scan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const WEB = path.join(REPO, "coolify/apps/nextjs-web");

const argv = process.argv.slice(2);
const valueOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const area = valueOf("--area") ?? "";
const dry = argv.includes("--dry");

const { en } = await import(`file://${path.join(WEB, "src/lib/ui-dictionary/en.ts")}`.replace(/\.ts$/, ".mjs")).catch(() => ({ en: null }));

// TS を直接読めないので、辞書は生成データから読む。
const dict = {};
const DATA = path.join(HERE, "data");
Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "seed.json"), "utf8")));
for (const f of fs.readdirSync(path.join(DATA, "translations")))
  if (f.endsWith(".json"))
    Object.assign(dict, JSON.parse(fs.readFileSync(path.join(DATA, "translations", f), "utf8")));
for (const k of JSON.parse(fs.readFileSync(path.join(DATA, "ambiguous.json"), "utf8"))) delete dict[k];
for (const k of JSON.parse(fs.readFileSync(path.join(DATA, "skip.json"), "utf8")).items) delete dict[k];

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (EXCLUDED.some((re) => re.test(full))) continue;
    if (e.isDirectory()) { walk(full); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    if (area && !full.includes(area)) continue;
    files.push(full);
  }
};
walk(path.join(WEB, "src"));

let touched = 0, replaced = 0, hooked = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["']/.test(source);
  // サーバー側（Server Component / Server Action）は await getTr()。
  // async でない関数には置けないので、そこは触らずに残す（`outside` で数える）。
  const r = transform(source, dict, {
    accessor: isClient ? "const tr = useTr();" : "const tr = await getTr();",
    requireAsync: !isClient,
  });
  if (!r.changed) continue;

  let code = r.code;
  if (r.hooked > 0) {
    if (!isClient) {
      if (!/from "@\/lib\/ui-text-server"/.test(code)) {
        const first = code.search(/^import\s/m);
        code =
          first >= 0
            ? `${code.slice(0, first)}import { getTr } from "@/lib/ui-text-server";\n${code.slice(first)}`
            : `import { getTr } from "@/lib/ui-text-server";\n${code}`;
      }
      touched++; replaced += r.replaced; hooked += r.hooked;
      console.log(`  ${path.relative(REPO, file)}  (${r.replaced} strings, ${r.hooked} server fns)`);
      if (!dry) fs.writeFileSync(file, code);
      continue;
    }
    if (!/from "@\/hooks\/useTr"/.test(code)) {
      // 既存の import の並びに入れる。"use client" の直後に入れると
      // ファイル冒頭の説明コメントの前に割り込んで読みにくくなる。
      const first = code.search(/^import\s/m);
      code =
        first >= 0
          ? `${code.slice(0, first)}import { useTr } from "@/hooks/useTr";\n${code.slice(first)}`
          : code.replace(
              /^(("use client";|'use client';)\s*\n)/,
              `$1\nimport { useTr } from "@/hooks/useTr";\n`,
            );
    }
  }
  touched++; replaced += r.replaced; hooked += r.hooked;
  console.log(`  ${path.relative(REPO, file)}  (${r.replaced} strings, ${r.hooked} components)`);
  if (!dry) fs.writeFileSync(file, code);
}
console.log(`\n${dry ? "[dry] " : ""}files ${touched}, strings ${replaced}, components ${hooked}`);
