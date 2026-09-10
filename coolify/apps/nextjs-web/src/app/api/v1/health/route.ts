/**
 * GET /api/v1/health — 外部 API の生存確認。**認証しない。**
 *
 * ■ なぜ認証しないのか
 * この口が存在する理由は、呼び出し側の監視が「サービスが落ちている」と
 * 「自分の資格情報が違う」を切り分けられるようにすること。トークンを要ると
 * 401 の意味が二重になり、この口が答えるべき唯一の問いに答えられなくなる。
 *
 * ■ なぜ安全か
 * **DB を一切触らず定数を返す。** /api/health（Coolify の probe）は
 * `_prisma_migrations` を読むが、それをここへ写すと未認証の相手に
 * 1 要求 = 1 往復の DB アクセスを配ることになる。外部の連携先が要るのは
 * プロセスの生存で、readiness は Coolify の仕事。
 *
 * ■ 機能フラグは効かせる
 * `api` が閉じている環境では 404。開く前から口の存在を広告しない。
 *
 * ※ この口は認可の門を通らない唯一の /api/v1 ルート。
 *    scripts/check-api-gates.mjs の除外リストに理由つきで載っている。
 */

import { notFound } from "@/lib/api-response";
import { isDevFeatureEnabled } from "@/lib/dev-features";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(): Response {
  if (!isDevFeatureEnabled("api")) return notFound();
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
