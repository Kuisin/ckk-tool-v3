/**
 * display-events.ts — ディスプレイ宛の合図（Postgres LISTEN/NOTIFY）。
 *
 * 管理画面は nextjs-web、ディスプレイの WS はこの nextjs-kiosk と、
 * **別のアプリ・別のプロセス**に居る。管理者が表示内容を変えた瞬間に
 * 壁の画面を切り替えるには、その境界を越えて合図を渡す必要がある。
 *
 * HTTP で叩き合う（web → kiosk の内部 API）のは採らない。キオスクが
 * nextjs-web の内部 API を叩かない、と決めた理由の裏返しで、
 * 一方が他方の口を知っていると、片方の都合で相手が壊れるため。
 *
 * 代わりに**両者が既に繋いでいる 1 つの DB** を経由する。nextjs-web の
 * realtime.ts と同じ仕組み（pg_notify）で、規約もそちらに合わせる:
 *
 *   **ペイロードは合図であって中身ではない。** 誰の何が変わったかだけを
 *   載せ、内容は受け取った側が引き直す（/api/display/config）。
 *   これで (1) バスに業務データが流れず、(2) 8000 バイト上限に近づかない。
 *
 * 取りこぼし（再接続中の NOTIFY）は許容する — ディスプレイは
 * refreshIntervalSec ごとに自分で引き直すので、遅くともそこで追いつく。
 *
 * ※ Next 依存なし（カスタムサーバー tsconfig.server.json からコンパイルされる）。
 */

export const DISPLAY_CHANNEL = "ckk_display";

export type DisplayEvent = {
  displayId: string;
  /** config_changed = 引き直せ / revoked = Cookie を捨てて登録画面へ */
  kind: "config_changed" | "revoked";
};

export function encodeDisplayEvent(event: DisplayEvent): string {
  return JSON.stringify(event);
}

/** 未検証の payload を DisplayEvent にする。壊れていれば null。 */
export function decodeDisplayEvent(payload: string): DisplayEvent | null {
  try {
    const parsed = JSON.parse(payload) as Partial<DisplayEvent>;
    if (typeof parsed.displayId !== "string" || !parsed.displayId) return null;
    if (parsed.kind !== "config_changed" && parsed.kind !== "revoked") {
      return null;
    }
    return { displayId: parsed.displayId, kind: parsed.kind };
  } catch {
    return null;
  }
}
