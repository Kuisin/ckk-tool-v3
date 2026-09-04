import "server-only";

/**
 * kiosk-events.ts — 共有端末（nextjs-kiosk）宛の合図。server-only.
 *
 * display-events.ts の端末版。管理画面（SY09）はこちら、端末の WebSocket は
 * nextjs-kiosk と**別プロセス**に居るので、取り消し・無効化・リンク解除を
 * した瞬間に相手のソケットを切るには境界を越えて合図を渡す必要がある。
 * 渡さないと、端末側の WS は生き続けて 30 秒ごとに last_activity_at を刻み、
 * 止めたはずの端末が SY09 で「オンライン」のまま残る。
 *
 * 経路は display-events.ts と同じ pg_notify（両者が既に繋いでいる 1 つの DB）。
 * **ペイロードは合図であって中身ではない** — 誰の何が変わったかだけを載せ、
 * 端末側は次の upgrade 認証（status = 'ACTIVE' の照合）で自然に弾かれる。
 *
 * 受け側は nextjs-kiosk の lib/ws-db.ts `subscribeKioskEvents`。
 * **チャネル名とペイロードの形は両アプリで揃えること**（片方だけ変えると
 * 合図が黙って届かなくなる）。合図が落ちても業務処理は止めない —
 * 端末側の touchConnectedDevices が ACTIVE 以外を刻まないので、遅くとも
 * 5 分窓の満了でオフラインに落ちる。
 */

import { prisma } from "./db";

const KIOSK_CHANNEL = "ckk_kiosk";

export type KioskEventKind = "revoked";

async function publish(deviceId: string, kind: KioskEventKind): Promise<void> {
  try {
    const payload = JSON.stringify({ deviceId, kind });
    await prisma.$executeRaw`SELECT pg_notify(${KIOSK_CHANNEL}, ${payload})`;
  } catch (e) {
    console.error("[kiosk] 合図の配信に失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
  }
}

/**
 * 端末の信頼が失われた（取り消し / 無効化 / リンク解除 / 鍵リセット）と
 * 1 台へ伝える。端末側はその端末のソケットを閉じ、プレゼンスから外す。
 */
export async function notifyKioskDeviceRevoked(
  deviceId: string,
): Promise<void> {
  await publish(deviceId, "revoked");
}
