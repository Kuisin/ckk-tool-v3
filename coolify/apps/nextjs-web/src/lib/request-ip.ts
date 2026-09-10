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
 *
 * キオスク側（nextjs-kiosk/src/lib/request-ip.ts）と同じ内容だが、twin file の
 * 対象にはしていない（env を読む = 純関数ではないため）。片方を直したら
 * もう片方も見ること。
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

/**
 * **レート制限のバケットを分けるためだけ**の IP。記録には使わない。
 *
 * `clientIpOf` は TRUSTED_PROXY_HOPS 段だけ遡った値を返し、既定（未設定 = 0）
 * では XFF の**右端** = 自分に一番近いプロキシの住所になる。社外からの通信は
 * client → cloudflared → nginx-proxy → app と流れるので、**社外の利用者は
 * 全員が同じ 1 つの値**に潰れる。そのまま IP バケットの鍵にすると、誰か 1 人の
 * 打ち間違いが 30 回積もった時点で社外の全員が 15 分締め出される（実際に
 * そうなる設定で動いていた）。
 *
 * そこで Cloudflare がトンネル通信に付ける `cf-connecting-ip`（本物の接続元）を
 * **優先する**。トレードオフははっきりさせておく: **このヘッダは偽装できる** —
 * Cloudflare を通らずにアプリへ届く経路（LAN 直・社内からの curl）なら誰でも
 * 好きな値を書ける。だから用途を「**バケットを分ける**」ことに限る:
 *
 *   - 身元の証拠にしない（login_attempts.ip_address は従来どおり clientIpOf）。
 *   - 社内 CIDR 判定・所有区分にも使わない。
 *   - 偽装できて困るのは「自分のバケットをずらして IP 制限を避ける」ことだが、
 *     **ユーザー名側のバケット（5 回）は別に効いている**ので、それ 1 本では
 *     password spraying は通らない。
 */
export function rateLimitIpOf(req: Request): string | null {
  // Cloudflare が付ける単一の値（チェーンではない）。
  const cf = normalizeIp(req.headers.get("cf-connecting-ip"));
  if (cf) return cf;
  return clientIpOf(req);
}

/** User-Agent（列長に合わせて丸める）。 */
export function userAgentOf(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  return ua ? ua.slice(0, 512) : null;
}
