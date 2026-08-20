/**
 * realtime-events.ts — リアルタイム配信イベントの型と符号化。pure / IO なし。
 *
 * 配信経路は Postgres LISTEN/NOTIFY（lib/realtime.ts）→ SSE
 * （/api/sse/*）。ここはその共通語彙だけを持つ。
 *
 * **ペイロードは「合図」であって中身ではない** — 誰の何が変わったかだけを
 * 載せ、本文はクライアントが再取得する。この方針には理由が 2 つある:
 *   1. バスに他人の通知本文が流れないので、配信先を誤っても内容が漏れない。
 *   2. pg_notify のペイロード上限（8000 バイト）に決して近づかない。
 */

/** LISTEN/NOTIFY チャネル名（アプリ全体で 1 本）。 */
export const REALTIME_CHANNEL = "ckk_realtime";

/**
 * pg_notify のペイロード上限は 8000 バイト。合図しか載せない設計なので
 * 実際は数十バイトに収まるが、将来イベントを増やしたときの歯止めとして
 * 余裕を持たせた値で検査する。
 */
export const REALTIME_MAX_PAYLOAD_BYTES = 7000;

/**
 * 配信イベント。今は通知のみ — 別の realtime 機能を足すときは
 * ここに kind を追加し、購読側で kind を絞り込む。
 */
export type RealtimeEvent = {
  /** 通知が増えた・既読になった等、userId のベルを更新すべき合図。 */
  kind: "notification";
  /** 宛先ユーザー（この人の接続にだけ配る）。 */
  userId: string;
};

/** NOTIFY ペイロードへ符号化。上限超過は呼び出し側のバグなので投げる。 */
export function encodeRealtimeEvent(event: RealtimeEvent): string {
  const payload = JSON.stringify(event);
  const bytes = Buffer.byteLength(payload, "utf8");
  if (bytes > REALTIME_MAX_PAYLOAD_BYTES) {
    throw new Error(
      `realtime ペイロードが大きすぎます (${bytes} > ${REALTIME_MAX_PAYLOAD_BYTES} バイト)`,
    );
  }
  return payload;
}

/**
 * NOTIFY ペイロードを復号。壊れた値・未知の kind は null
 * （購読側は無視する — 不正な合図でストリームを落とさない）。
 */
export function decodeRealtimeEvent(
  raw: string | undefined,
): RealtimeEvent | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { kind, userId } = parsed as Record<string, unknown>;
  if (kind !== "notification") return null;
  if (typeof userId !== "string" || userId === "") return null;
  return { kind, userId };
}
