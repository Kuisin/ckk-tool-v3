/**
 * GET /api/sse/notifications — ヘッダーベルのリアルタイム更新（SSE）。
 *
 * ログインユーザー宛の合図だけを流す。本文は載せない — クライアントは
 * 合図を受けて /api/notifications を取り直す（lib/realtime-events.ts 参照）。
 *
 * 送るイベント:
 *   ready        購読が確立した（クライアントはここで初期取得する）
 *   notification 自分の通知が変化した（再取得の合図）
 *   `: ping`     コメント行の心拍。プロキシのアイドル切断を防ぐ。
 */

import { auth } from "@/auth";
import { subscribeRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";
// pg の LISTEN 接続を使うため Node ランタイム必須（Edge では動かない）。
export const runtime = "nodejs";

/** nginx / cloudflared の既定アイドル（60s〜）より十分短く。 */
const HEARTBEAT_MS = 25_000;

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      /** 閉じた後の enqueue は例外になるので必ずここを通す。 */
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // クライアントが既に切断済み — cleanup に任せる。
          cleanup();
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      function cleanup() {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // 既に閉じている
        }
      }

      // クライアント切断（タブを閉じた・ページ遷移）で購読を解放する。
      request.signal.addEventListener("abort", cleanup);
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      // 再接続間隔のヒント（EventSource 既定の 3 秒より少し長く）。
      write("retry: 5000\n\n");

      unsubscribe = await subscribeRealtime((event) => {
        if (event.kind === "notification" && event.userId === userId) {
          send("notification", { at: new Date().toISOString() });
        }
      });
      if (closed) {
        // 購読確立を待つ間に切断されていた
        unsubscribe();
        unsubscribe = null;
        return;
      }

      // ここから先のイベントは届く — クライアントに初期取得させる。
      send("ready", { at: new Date().toISOString() });

      heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform: プロキシに圧縮・バッファリングさせない
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx のレスポンスバッファリング無効化（無いと心拍まで溜め込まれる）
      "X-Accel-Buffering": "no",
    },
  });
}
