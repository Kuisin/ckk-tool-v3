/**
 * manual-videos.ts — マニュアルの動画ディレクトリを読む（サーバー専用）。
 *
 * 置き場は env `MANUAL_VIDEO_DIR`（Coolify では /data/manual-videos-{dev|main} を
 * 読み取り専用で bind mount したもの）。**未設定・ディレクトリなし・manifest なしは
 * すべて「動画なし」** — 手元の開発・CI・録画アプリを入れる前の環境では動画が
 * 無いのが普通で、そのときマニュアルは静止画だけで今までどおり読める。
 *
 * manifest.json は**リクエストのたびに読む**（キャッシュしない）。録画アプリが
 * 入れ替えた直後から新しい動画を出すためで、数 KB のファイルなので費用は無い。
 */

import "server-only";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import {
  type ManualVideoManifest,
  parseManifest,
  resolveMedia,
} from "./manual-videos-core";

function videoDir(): string | null {
  const dir = process.env.MANUAL_VIDEO_DIR?.trim();
  return dir ? dir : null;
}

/** いま配れる動画の一覧。無ければ null。 */
export async function readManualVideoManifest(): Promise<ManualVideoManifest | null> {
  const dir = videoDir();
  if (!dir) return null;
  try {
    return parseManifest(
      JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")),
    );
  } catch {
    // ファイルが無い・JSON が壊れている（書き換えの途中）— どちらも「動画なし」。
    return null;
  }
}

export interface ManualMediaFile {
  path: string;
  size: number;
  contentType: string;
  /** 変わったことが分かる印（ETag 用）。 */
  version: string;
}

/**
 * URL のファイル名から実ファイルを引く。許可リスト（manifest の id × 既知の拡張子）に
 * 無い名前は null — 名前をパスに継ぐのは resolveMedia を通ったものだけ。
 */
export async function findManualMedia(
  name: string,
): Promise<ManualMediaFile | null> {
  const dir = videoDir();
  if (!dir) return null;
  const manifest = await readManualVideoManifest();
  if (!manifest) return null;
  const media = resolveMedia(name, manifest);
  if (!media) return null;
  const path = join(dir, media.filename);
  try {
    const st = await stat(path);
    if (!st.isFile()) return null;
    return {
      path,
      size: st.size,
      contentType: media.contentType,
      version: `${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}`,
    };
  } catch {
    return null; // サムネイルが無い動画など
  }
}

/** ファイルの一部（両端を含む）を Web の ReadableStream として開く。 */
export function openManualMedia(
  path: string,
  range?: { start: number; end: number },
): ReadableStream<Uint8Array> {
  return Readable.toWeb(
    createReadStream(path, range),
  ) as ReadableStream<Uint8Array>;
}
