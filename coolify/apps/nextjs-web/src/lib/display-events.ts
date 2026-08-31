import "server-only";

/**
 * display-events.ts — ディスプレイ（nextjs-kiosk）宛の合図。server-only.
 *
 * 管理画面はこちら（nextjs-web）、ディスプレイの WebSocket は nextjs-kiosk と、
 * **別アプリ・別プロセス**に居る。表示内容を変えた瞬間に壁の画面を切り替える
 * には、その境界を越えて合図を渡す必要がある。
 *
 * HTTP で相手の口を叩くのは採らない（キオスクが nextjs-web の内部 API を
 * 叩かないと決めたのと同じ理由 — 一方が他方の口を知っていると、片方の都合で
 * 相手が壊れる）。代わりに**両者が既に繋いでいる 1 つの DB** を経由する。
 * 仕組みは realtime.ts と同じ pg_notify で、規約もそちらに合わせる:
 *
 *   **ペイロードは合図であって中身ではない。** 何が変わったかだけを載せ、
 *   内容は受け取った側が /api/display/config で引き直す。
 *
 * 受け側は nextjs-kiosk の lib/display-ws-db.ts `subscribeDisplayEvents`。
 * **チャネル名とペイロードの形は両アプリで揃えること**（片方だけ変えると
 * 合図が黙って届かなくなる — 画面は refreshIntervalSec で追いつくので、
 * 「遅いだけ」に見えて原因が分かりにくい）。
 *
 * 失敗しても業務処理は止めない。合図が落ちても、ディスプレイは自分の
 * 再取得間隔で必ず追いつく。
 */

import { prisma } from "./db";

const DISPLAY_CHANNEL = "ckk_display";

export type DisplayEventKind = "config_changed" | "revoked";

async function publish(
  displayId: string,
  kind: DisplayEventKind,
): Promise<void> {
  try {
    const payload = JSON.stringify({ displayId, kind });
    await prisma.$executeRaw`SELECT pg_notify(${DISPLAY_CHANNEL}, ${payload})`;
  } catch (e) {
    console.error("[display] 合図の配信に失敗:", e);
  }
}

/** 表示内容が変わったので引き直せ、と 1 台へ伝える。 */
export async function notifyDisplayConfigChanged(
  displayId: string,
): Promise<void> {
  await publish(displayId, "config_changed");
}

/** 失効した（Cookie を捨てて登録画面へ戻れ）と 1 台へ伝える。 */
export async function notifyDisplayRevoked(displayId: string): Promise<void> {
  await publish(displayId, "revoked");
}

/** 表示内容が変わったので、それを使っている全画面へ伝える。 */
export async function notifyProfileChanged(profileId: string): Promise<void> {
  const devices = await prisma.displayDevice.findMany({
    where: { displayProfileId: profileId, status: "ACTIVE" },
    select: { id: true },
  });
  await Promise.all(devices.map((d) => publish(d.id, "config_changed")));
}
