/**
 * lint-screenshots.ts — マニュアル ↔ manifest ↔ PNG の整合性チェック。
 *
 * 失敗（exit 1）:
 *   - マニュアル（frontmatter screenshots / 本文の画像参照）が manifest に
 *     ない id を参照している
 *   - 参照されている id の PNG がディスクにない
 * 警告のみ:
 *   - manifest にあるのにどのページからも参照されていない id
 *
 * CI では docs:lint として実行する（撮影はローカルのみ）。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shots } from "../manifest";

const HERE = join(fileURLToPath(import.meta.url), "../..");
const MANUAL_DIR = resolve(HERE, "../../coolify/apps/nextjs-web/content/manual");
const SHOT_DIR = join(MANUAL_DIR, "assets/screenshots");

const manifestIds = new Set(shots.map((s) => s.id));

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith(".md")) yield p;
  }
}

/** frontmatter の screenshots 配列（inline / ダッシュ形式の両方）を抜き出す。 */
function frontmatterScreenshots(md: string): string[] {
  const fm = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return [];
  const ids: string[] = [];
  const inline = fm[1].match(/^screenshots:\s*\[([^\]]*)\]/m);
  if (inline) {
    for (const raw of inline[1].split(",")) {
      const id = raw.trim().replace(/^["']|["']$/g, "");
      if (id) ids.push(id);
    }
    return ids;
  }
  const block = fm[1].match(/^screenshots:\s*\n((?:\s*-\s*.+\n?)+)/m);
  if (block) {
    for (const line of block[1].split("\n")) {
      const m = line.match(/^\s*-\s*["']?([^"'\s]+)["']?/);
      if (m) ids.push(m[1]);
    }
  }
  return ids;
}

/** 本文中の assets/screenshots/<id>.png 参照。 */
function imageRefs(md: string): string[] {
  return [...md.matchAll(/assets\/screenshots\/([A-Za-z0-9_-]+)\.png/g)].map(
    (m) => m[1],
  );
}

let errors = 0;
const referenced = new Set<string>();

for (const file of walk(MANUAL_DIR)) {
  const md = readFileSync(file, "utf8");
  const rel = file.slice(MANUAL_DIR.length + 1);
  for (const id of [...frontmatterScreenshots(md), ...imageRefs(md)]) {
    referenced.add(id);
    if (!manifestIds.has(id)) {
      console.error(`✖ ${rel}: unknown screenshot id "${id}" (not in manifest.ts)`);
      errors++;
    } else if (!existsSync(join(SHOT_DIR, `${id}.png`))) {
      console.error(`✖ ${rel}: screenshot "${id}" referenced but PNG missing — run docs:shots:one -- --only ${id}`);
      errors++;
    }
  }
}

for (const id of manifestIds) {
  if (!referenced.has(id)) {
    console.warn(`⚠ manifest id "${id}" is not referenced by any manual page`);
  }
}

if (errors > 0) {
  console.error(`\ndocs:lint failed with ${errors} error(s)`);
  process.exit(1);
}
console.log(`docs:lint OK — ${referenced.size} referenced id(s), ${manifestIds.size} in manifest`);
