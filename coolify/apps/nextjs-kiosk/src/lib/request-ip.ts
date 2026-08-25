/**
 * request-ip.ts — リクエストから送信元 IP / UA を取り出す。
 *
 * **x-forwarded-for の左端を採ってはいけない**。左端はクライアントが自由に
 * 書ける値で、社内ネットワーク判定（所有区分）や不正検知の材料にすると
 * ヘッダ 1 行で偽装できてしまう。判定ロジックは cidr-core（twin file）に
 * あり、ここは env を読んで渡すだけの薄い層。
 *
 * TRUSTED_PROXY_HOPS = 自分の前に居る「XFF に追記するプロキシ」の数。
 * 未設定なら 0（右端 = 最も近いプロキシが観測した値）。実運用ではまず 0 で
 * 入れ、記録された生チェーン（login_attempts.ip_chain）を見てから合わせる。
 */

import { clientIpFromForwardedFor, normalizeIp } from "@/lib/cidr-core";

function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** XFF の生チェーン（設定した段数が正しいか後から検算するために残す）。 */
export function forwardedChainOf(req: Request): string | null {
  const raw = req.headers.get("x-forwarded-for");
  if (!raw) return null;
  return raw.slice(0, 200);
}

/** 送信元 IP（正規形）。取れなければ null。 */
export function clientIpOf(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  const fromChain = clientIpFromForwardedFor(xff, trustedProxyHops());
  if (fromChain) return fromChain;
  // プロキシを挟まない構成（LAN 直・開発）でのフォールバック
  return normalizeIp(req.headers.get("x-real-ip"));
}

/** User-Agent（列長に合わせて丸める）。 */
export function userAgentOf(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  return ua ? ua.slice(0, 512) : null;
}
