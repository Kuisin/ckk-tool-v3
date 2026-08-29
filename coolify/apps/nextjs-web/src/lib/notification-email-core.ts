/**
 * notification-email-core.ts — 通知メールの送り方（純粋関数）。
 *
 * これまで通知は **1 件 = 1 通**でメールしていた。アプリ内で既に読んだものにも
 * 同じだけ飛ぶので、承認が回る日は受信箱が通知で埋まり、本当に見るべき 1 通が
 * その中に紛れていた。
 *
 * Microsoft Teams の「不在時のアクティビティ」と同じ形にする:
 *   **見逃した（＝猶予を過ぎても未読の）通知だけを、間隔をあけて 1 通にまとめる。**
 * アプリ内やプッシュで先に気づいて読んでいれば、その通知はメールされない —
 * 減るぶんの大半はここから来る。
 *
 * 種別ごとに「待たせない（即時 1 通）」を選べる余地は残してある。既定は空
 * （＝全部ダイジェスト）で、待たせたくない種別が出てきたら管理者が
 * 通知メール設定（SY0F）で足す。
 *
 * DB も server-only も参照しないので単体テストできる。読み書きは
 * `notification-email-settings.ts`、掃き出しは `notification-digest.ts`、
 * 画面は `/settings/notification-email`。
 */

import { z } from "zod";
import {
  NOTIFICATION_TYPES,
  type NotificationType,
} from "./notifications-core";

export interface NotificationEmailSettings {
  /** まとめて送る。false = 従来どおり 1 件ずつ即時に送る。 */
  digestEnabled: boolean;
  /** 同じ人へ次のダイジェストを送るまでの最短間隔（分）。 */
  intervalMinutes: number;
  /** 作られてからこれだけ経っても未読なら「見逃し」とみなす（分）。 */
  graceMinutes: number;
  /** ダイジェストを待たずに即時 1 通で送る種別。 */
  immediateTypes: NotificationType[];
  /** 1 通に並べる最大件数。超えた分は「ほか N 件」に畳む。 */
  maxItemsPerMail: number;
}

export const DEFAULT_NOTIFICATION_EMAIL_SETTINGS: NotificationEmailSettings = {
  digestEnabled: true,
  intervalMinutes: 60,
  graceMinutes: 15,
  // 既定は「即時なし」= 全部ダイジェスト。メール量を減らすのが目的なので、
  // 例外はゼロから始めて必要になった種別だけ管理者が足す。
  immediateTypes: [],
  maxItemsPerMail: 20,
};

export const notificationEmailSettingsSchema = z.object({
  digestEnabled: z.boolean(),
  // 5 分より短くしても掃き出しの周期（NOTIFICATION_DIGEST_TICK_MS）より細かくは
  // ならない。1440 = 1 日 1 通。
  intervalMinutes: z.number().int().min(5).max(1440),
  graceMinutes: z.number().int().min(0).max(1440),
  immediateTypes: z.array(z.enum(NOTIFICATION_TYPES)),
  maxItemsPerMail: z.number().int().min(1).max(100),
});

/**
 * その種別を待たせずに 1 通で送るか。
 * ダイジェストを切ってあるときは全部が即時（＝以前の挙動に戻る）。
 */
export function sendsImmediateEmail(
  settings: NotificationEmailSettings,
  type: NotificationType,
): boolean {
  if (!settings.digestEnabled) return true;
  return settings.immediateTypes.includes(type);
}

/**
 * 「見逃し」の締切。これより前に作られた未読だけがダイジェストに載る。
 *
 * 猶予を置くのは、**通知が届いた直後に人が画面で読む**のがいちばん普通の
 * 流れだから。作った瞬間に拾うと、読まれる前に必ずメールが出てしまい、
 * まとめる意味が薄れる。
 */
export function digestCutoff(
  now: Date,
  settings: NotificationEmailSettings,
): Date {
  return new Date(now.getTime() - settings.graceMinutes * 60_000);
}

/**
 * 前回の送信から間隔があいたか。lastSentAt が無い（＝一度も送っていない）
 * 人には即座に送ってよい。
 */
export function isDigestDue(
  now: Date,
  lastSentAt: Date | null,
  settings: NotificationEmailSettings,
): boolean {
  if (!lastSentAt) return true;
  return (
    now.getTime() - lastSentAt.getTime() >= settings.intervalMinutes * 60_000
  );
}

export interface DigestItem {
  id: string;
  type: string;
  title: string;
  message: string | null;
  createdAt: Date;
}

/**
 * 1 通に並べる分と、畳んだ件数に分ける。
 *
 * **畳んだ分もメール済みとして印を付ける**（呼び出し側の責任）。次の回に
 * 持ち越すと、溜まっている人へ延々と同じ内容が届き続けることになる。
 * 件数は件名と本文に出るので、畳まれても「何件あるか」は伝わる。
 */
export function splitDigestItems(
  items: DigestItem[],
  settings: NotificationEmailSettings,
): { shown: DigestItem[]; omittedCount: number } {
  const shown = items.slice(0, settings.maxItemsPerMail);
  return { shown, omittedCount: items.length - shown.length };
}

/** ダイジェストの件名。件数を先に出す（受信箱の一覧で判断できるように）。 */
export function digestSubject(total: number): string {
  return `【CKK】未読の通知 ${total} 件`;
}
