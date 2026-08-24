/**
 * placeholders.ts — manifest にあって PNG が無い id にプレースホルダを作る。
 *
 * なぜ必要か: マニュアル本文が画像を参照すると、fumadocs は画像を静的 import
 * するため **PNG が実在しないとビルドが落ちる**。一方 docs:shots は
 * 「ビルド → 起動 → 撮影」の順なので、新しい撮影を足した最初の 1 回は
 * 「本文は参照している / PNG はまだ無い」状態になり、撮影までたどり着けない。
 *
 * そこで撮影前にこのスクリプトで 1×1 の灰色 PNG を置いておく。撮影が走れば
 * 実物で上書きされる。docs:shots が自動で呼ぶので通常は直接実行不要。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shots } from "../manifest";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../coolify/apps/nextjs-web/content/manual/assets/screenshots",
);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([len, typed, crc]);
}

/** 単色 PNG（依存なしで生成 — 撮影で上書きされる一時ファイル）。 */
function solidPng(width: number, height: number, gray = 0xdd): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const raw = Buffer.alloc(height * (width * 3 + 1), gray);
  for (let y = 0; y < height; y++) raw[y * (width * 3 + 1)] = 0; // filter byte
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });

let created = 0;
for (const shot of shots) {
  const path = join(OUT_DIR, `${shot.id}.png`);
  if (existsSync(path)) continue;
  writeFileSync(path, solidPng(16, 10));
  console.log(`placeholder: ${shot.id}.png`);
  created++;
}
console.log(
  created === 0
    ? "placeholders: nothing missing"
    : `placeholders: ${created} created (次の docs:shots で実物に置き換わります)`,
);
