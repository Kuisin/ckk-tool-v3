/**
 * kiosk-origin.ts — 共有端末アプリ（nextjs-kiosk）の入口 URL を求める。
 *
 * 管理画面（nextjs-web）から**キオスク側のページを埋め込みたい**場面がある —
 * テンプレートの見本（/display/preview/…）がそれ。ところが 2 つのアプリは
 * ホスト名が別で、nextjs-web はキオスクの URL を知らない。
 *
 * **専用の env を増やさない。** 既に `NEXT_PUBLIC_KIOSK_WS_URL`
 * （= wss://<kiosk-host>/api/kiosk/ws）が両環境に入っていて、これは
 * useKioskPresence / useDisplayPresence が使っている。同じホストなので、
 * ここから origin を取り出せば足りる。env を 2 本持つと、片方だけ直った
 * ときに「プレゼンスは動くのに見本が出ない」という食い違いが起きる。
 *
 * 求められないときは null を返す（見本が出ないだけで、設定そのものはできる）。
 */

/** ws(s):// の URL から http(s):// の origin を作る。失敗したら null。 */
export function kioskOriginFrom(wsUrl: string | undefined): string | null {
  if (!wsUrl) return null;
  try {
    const u = new URL(wsUrl);
    if (u.protocol === "wss:") return `https://${u.host}`;
    if (u.protocol === "ws:") return `http://${u.host}`;
    // 既に http(s) で入っているなら、そのまま origin を採る
    if (u.protocol === "http:" || u.protocol === "https:") return u.origin;
    return null;
  } catch {
    return null;
  }
}

/**
 * 現在の環境のキオスク origin。
 *
 * `process.env.NEXT_PUBLIC_*` は**ビルド時に埋め込まれる**ので、変数名を
 * 直接書かないと置換されない（`process.env[name]` は動かない）。
 */
export function kioskOrigin(): string | null {
  return kioskOriginFrom(process.env.NEXT_PUBLIC_KIOSK_WS_URL);
}
