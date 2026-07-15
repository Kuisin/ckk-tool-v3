/**
 * push.ts — Web Push（PWA プッシュ通知）配信。server-only.
 *
 * VAPID 鍵ペアで認証してブラウザのプッシュサービスへ送る標準 Web Push。
 * 外部サービス不要（FCM 等は使わない — プッシュサービスは各ブラウザ既定）。
 *
 * 環境変数（未設定ならプッシュチャネルは黙ってスキップ）:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY … クライアントの購読にも使う公開鍵
 *   VAPID_PRIVATE_KEY            … サーバー秘密鍵
 *   VAPID_SUBJECT                … mailto: 連絡先（既定 mailto:admin@ckk-tool.co.jp）
 *
 * 鍵の生成: `npx web-push generate-vapid-keys`（1 回だけ。全環境で共有可）。
 */

import webpush from "web-push";
import { prisma } from "./db";

let configured: boolean | undefined;

/** VAPID 設定済みか。初回呼び出しで web-push に鍵を設定する。 */
export function isPushConfigured(): boolean {
  if (configured !== undefined) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@ckk-tool.co.jp",
    pub,
    priv,
  );
  configured = true;
  return configured;
}

export interface PushPayload {
  title: string;
  body?: string;
  /** アプリ内パス — 通知タップで開く。 */
  link?: string;
}

/**
 * 1 ユーザーの全購読（全デバイス）へ配信。失効した購読（404/410）は
 * その場で削除する。ベストエフォート — 失敗しても throw しない。
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!isPushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body,
        );
      } catch (e) {
        const status =
          typeof e === "object" && e !== null && "statusCode" in e
            ? Number((e as { statusCode: unknown }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          // 購読失効（アンインストール・権限取消など）→ 掃除
          await prisma.pushSubscription
            .delete({ where: { id: sub.id } })
            .catch(() => {});
        } else {
          console.error(`[push] 配信失敗 user=${userId}:`, e);
        }
      }
    }),
  );
}
