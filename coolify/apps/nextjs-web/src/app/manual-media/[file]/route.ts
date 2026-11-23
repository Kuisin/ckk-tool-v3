/**
 * /manual-media/<file> — マニュアルの動画（録画・字幕・サムネイル）と、その一覧。
 *
 *   /manual-media/manifest.json      いま配れる動画の一覧（無ければ videos: []）
 *   /manual-media/<id>.webm|vtt|jpg  動画・字幕・サムネイル
 *
 * **ログイン不要**（proxy.ts の matcher から除外してある）。マニュアル /manual が
 * 公開コンテンツなので、その中の動画も同じ扱いにする — 除外しないと未ログインの
 * 読者には動画の代わりに /login への 307 が返る。写っているのは使い捨て DB の
 * デモデータだけで、実データは入らない（録画は専用の空の DB に対して行う）。
 *
 * 動画はイメージに入っていない。置き場と「無いときの扱い」は lib/manual-videos.ts。
 */

import {
  findManualMedia,
  openManualMedia,
  readManualVideoManifest,
} from "@/lib/manual-videos";
import { parseRange } from "@/lib/manual-videos-core";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;

  if (file === "manifest.json") {
    const manifest = await readManualVideoManifest();
    // 無いのは異常ではない（手元・CI・録画前）。404 にすると読者のコンソールに
    // エラーが出て、全画面の読み込み確認が落ちる。空の一覧を 200 で返す。
    return Response.json(
      manifest ?? { commit: null, recordedAt: null, videos: [] },
      { headers: { "Cache-Control": "no-cache" } },
    );
  }

  const media = await findManualMedia(file);
  if (!media) return new Response("Not found", { status: 404 });

  const etag = `"${media.version}"`;
  const common = {
    "Content-Type": media.contentType,
    "Accept-Ranges": "bytes",
    // **private** — 手前の Cloudflare にキャッシュさせない。public にすると、拡張子
    // （.webm）で既定のキャッシュ対象になり、Cloudflare は Range を外して全体を
    // 取りに来る。ところが Next はルートハンドラの応答から Content-Length を必ず
    // 落として chunked で送る（send-response.js の FORBIDDEN_HEADERS — こちらで
    // 付けても届かない）ので、Cloudflare は「長さの分からないもの」として持ち、
    // 範囲を指定しても全体を 200 で返す = **動画のシークが効かない**（手順への
    // ジャンプが先頭からの再生になる）。公開ホスト名で実際にそうなった。中の
    // ネットワークから直接叩くと 206 が返るので、手元の確認では気づけない。
    // private なら Cloudflare は素通しし、Range はそのままここへ届く。
    // 読者のブラウザには持たせてよい: URL には録画時刻の ?v= が付く
    // （ManualVideo.tsx）ので、撮り直せば URL ごと変わる。
    "Cache-Control": "private, max-age=3600",
    ETag: etag,
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: common });
  }

  const range = parseRange(request.headers.get("range"), media.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { ...common, "Content-Range": `bytes */${media.size}` },
    });
  }
  if (range) {
    return new Response(openManualMedia(media.path, range), {
      status: 206,
      headers: {
        ...common,
        "Content-Range": `bytes ${range.start}-${range.end}/${media.size}`,
        "Content-Length": String(range.end - range.start + 1),
      },
    });
  }
  return new Response(openManualMedia(media.path), {
    status: 200,
    headers: { ...common, "Content-Length": String(media.size) },
  });
}
