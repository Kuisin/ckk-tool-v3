/**
 * manual-videos-core.ts — マニュアルの動画（業務の通し操作の録画）の純ロジック。
 *
 * 動画は**リポジトリにもイメージにも入っていない**。録画は Coolify の
 * manual-videos アプリが行い（tools/docs-screenshots/scripts/walkthroughs.ts）、
 * ホストのディレクトリへ書き出す。nextjs-web はそこを読み取り専用で mount し、
 * /manual-media/<file> で配る（lib/manual-videos.ts・app/manual-media）。
 *
 * ここに置くのは、ファイルシステムに触らずに決められること:
 *   - manifest.json の形の検証（別のアプリが書いたファイルなので境界で確かめる）
 *   - **配ってよいファイル名の許可リスト**（manifest に載っている id だけ）
 *   - Range ヘッダの解釈（動画のシークに要る）
 */

import { z } from "zod";

/** 動画の id。ファイル名になるので、英小文字・数字・ハイフンだけ。 */
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

const videoSchema = z.object({
  id: idSchema,
  docPage: z.string(),
  title: z.string(),
  durationSec: z.number().nonnegative(),
  chapters: z.array(
    z.object({ title: z.string(), startSec: z.number().nonnegative() }),
  ),
});

const manifestSchema = z.object({
  commit: z.string().nullable(),
  recordedAt: z.string(),
  videos: z.array(videoSchema),
});

export type ManualVideo = z.infer<typeof videoSchema>;
export type ManualVideoManifest = z.infer<typeof manifestSchema>;

/** manifest.json を検証して返す。形が違えば null（= 動画なしとして扱う）。 */
export function parseManifest(json: unknown): ManualVideoManifest | null {
  const parsed = manifestSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * 配るときの名前（URL の最後の部分）→ 実ファイルの拡張子と Content-Type。
 *
 * **動画の URL は `.webm` で終わらせない（`<id>.video`）。** 公開ホスト名の手前に居る
 * Cloudflare は、URL の拡張子が既定のキャッシュ対象（.webm / .mp4 / .jpg …）だと、
 * **応答を見る前に** Range を外してオリジンへ全体を取りに来る。こちらが
 * `Cache-Control: private` を返してキャッシュさせなくても、外された Range は
 * 戻らない — 範囲を指定しても全体が 200 で返り、動画のシーク（手順へのジャンプ）が
 * 先頭からの再生になる（`cf-cache-status: BYPASS` なのに 200 だった）。
 * 拡張子が対象外なら Cloudflare は Range をそのまま通す。
 * 字幕（.vtt）は対象外、サムネイル（.jpg）は Range が要らないのでそのまま。
 */
export const MEDIA_KINDS = {
  video: { ext: "webm", contentType: "video/webm" },
  vtt: { ext: "vtt", contentType: "text/vtt; charset=utf-8" },
  jpg: { ext: "jpg", contentType: "image/jpeg" },
} as const;

export type MediaKind = keyof typeof MEDIA_KINDS;

/**
 * 配ってよいファイルかを決める。**manifest に載っている id × 既知の種類だけ**。
 *
 * 利用者が URL に書いた文字列をそのままパスへ継がない。`../` を弾く正規表現を
 * 書くのではなく、こちらが知っている名前と完全一致したものだけを通す —
 * 弾き方を間違える余地が無い。
 */
export function resolveMedia(
  name: string,
  manifest: ManualVideoManifest,
): {
  id: string;
  kind: MediaKind;
  filename: string;
  contentType: string;
} | null {
  const m = /^([a-z0-9][a-z0-9-]{0,63})\.(video|vtt|jpg)$/.exec(name);
  if (!m) return null;
  const [, id, kind] = m as unknown as [string, string, MediaKind];
  if (!manifest.videos.some((v) => v.id === id)) return null;
  const { ext, contentType } = MEDIA_KINDS[kind];
  return { id, kind, filename: `${id}.${ext}`, contentType };
}

/**
 * `Range: bytes=…` を解釈する。動画のシークはブラウザが範囲を指定して取りに来るので、
 * これに応えないと「途中から再生」「章へ飛ぶ」が先頭からの読み直しになる。
 *
 *   null        … Range なし、または解釈できない形（全体を 200 で返す）
 *   "invalid"   … 範囲がファイルの外（416 を返す）
 *   {start,end} … 返す範囲（両端を含む）
 *
 * 複数範囲（`bytes=0-1,5-6`）は扱わない — 動画プレーヤーは使わないので全体を返す。
 */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (size === 0) return "invalid";
  if (a === "") {
    // 末尾から N バイト
    const n = Number(b);
    if (n === 0) return "invalid";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Math.min(Number(b), size - 1);
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

/** 秒 → `m:ss`（章の一覧に出す）。 */
export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
