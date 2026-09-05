import "server-only";

/**
 * notification-digest.ts — 見逃した未読の掃き出し（Teams 型のダイジェスト）。
 *
 * 定期的に呼ばれ（instrumentation.ts）、**猶予を過ぎても未読で、まだメールに
 * 載せていない**通知を人ごとにまとめて 1 通送る。アプリ内やプッシュで先に
 * 読まれていれば、その通知はメールされない — 送信量が減るのはここ。
 *
 * 送った印は `notifications.email_sent_at`。この 1 列が
 *   (1) 同じ通知を二度送らないための印
 *   (2) その人へ最後に送った時刻（MAX で引ける）= 送信間隔の基準
 * を兼ねる（列を増やさないための設計 — migration のコメントも参照）。
 *
 * 判定規則は `notification-email-core.ts`（純粋・試験あり）が持つ。ここは
 * DB とメールの都合だけを見る。
 */

import { PERIODIC_LOCKS, withAdvisoryLock } from "./advisory-lock";
import { prisma } from "./db";
import { notificationTypeLabel } from "./enum-labels";
import { documentFormatters } from "./format";
import { normalizeLocale } from "./i18n";
import {
  appBaseUrl,
  isMailerConfigured,
  sendNotificationDigestMail,
} from "./mailer";
import {
  digestCutoff,
  digestSubject,
  isDigestDue,
  splitDigestItems,
} from "./notification-email-core";
import { getNotificationEmailSettings } from "./notification-email-settings";
import { notificationOpenPath } from "./notifications-core";

/**
 * 1 回の掃き出しで見る最大行数。溜まっていても 1 周で全部読まず、次の周期に
 * 回す（1 度のクエリとメール送信で詰まらせないため）。
 */
const SWEEP_LIMIT = 2_000;

/**
 * 同時実行を防ぐ（周期が短いときや、前回が長引いたときの重なり）。
 * **プロセス内だけの印**なので、コンテナが 2 つあるときは効かない —
 * 跨プロセスの排他は下の advisory lock が持つ。
 */
let running = false;

export interface DigestRunResult {
  /** メールを送った人数。 */
  users: number;
  /** メールに載せた（= email_sent_at を付けた）通知の件数。 */
  notifications: number;
}

/**
 * 掃き出しを 1 回走らせる。ベストエフォート — 失敗しても例外は投げない
 * （呼び出し元は定期タイマー）。
 *
 * ★ **ローリングデプロイ中は新旧 2 つのコンテナが同時に走る。** 印は
 * `notifications.email_sent_at` の 1 列だけなので、2 本が同じ未読を同時に
 * 読むと**同じ通知が 2 通飛ぶ**。プロセス内の `running` では防げないので、
 * DB のアドバイザリロックで 1 プロセスに絞る。
 */
export async function runNotificationDigest(): Promise<DigestRunResult> {
  const empty = { users: 0, notifications: 0 };
  if (running) return empty;
  // dev/main が DB を共有しているため、検証環境からの実ユーザーへの送信を
  // 止めるキルスイッチ（notify() の外部チャネルと同じ扱い）。
  if (process.env.NOTIFY_EXTERNAL_DISABLED === "1") return empty;
  // 送信口が無い環境（ローカル・MAIL_API_* 未設定）では何もしない。ここで
  // 抜けないと、毎周期「印を付ける → 送信に失敗 → 印を戻す」を延々と繰り返す。
  if (!isMailerConfigured()) return empty;
  running = true;
  try {
    const outcome = await withAdvisoryLock(
      PERIODIC_LOCKS.notificationDigest,
      sweep,
    );
    // 取れなかった = 別のコンテナが掃き出している。次のティックで見直す。
    return outcome.result ?? empty;
  } catch (e) {
    console.error("[notification-digest] 掃き出しに失敗:", e); // i18n-ignore — サーバーログのみ（Loki）、UI に出ない
    return empty;
  } finally {
    running = false;
  }
}

async function sweep(): Promise<DigestRunResult> {
  const settings = await getNotificationEmailSettings();
  if (!settings.digestEnabled) return { users: 0, notifications: 0 };

  const now = new Date();
  // 宛先の条件（有効なユーザー・メールアドレスあり・メールチャネルを切って
  // いない）は**問い合わせ側に置く**。後で捨てると、メールを切っている人の
  // 未読が毎回ここに積もって SWEEP_LIMIT を食い、他の人のぶんが押し出される。
  const pending = await prisma.notification.findMany({
    where: {
      isRead: false,
      emailSentAt: null,
      createdAt: { lte: digestCutoff(now, settings) },
      user: {
        isActive: true,
        email: { not: null },
        // 設定行が無い = 全チャネル有効（notify() と同じ既定）。
        OR: [
          { notificationSetting: null },
          { notificationSetting: { emailEnabled: true } },
        ],
      },
    },
    orderBy: { createdAt: "asc" },
    take: SWEEP_LIMIT,
    select: {
      id: true,
      userId: true,
      type: true,
      title: true,
      message: true,
      createdAt: true,
      user: { select: { email: true, locale: true } },
    },
  });
  if (pending.length === 0) return { users: 0, notifications: 0 };

  const byUser = new Map<string, typeof pending>();
  for (const row of pending) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }
  const userIds = [...byUser.keys()];

  // 「その人へ最後にメールした時刻」= MAX(email_sent_at)。即時送信の分も
  // 同じ列に印が付くので、即時が 1 通出た直後はダイジェストもその間隔ぶん
  // 待つ。送信量を抑えるのが目的なので、これで正しい。
  const lastSent = await prisma.notification.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, emailSentAt: { not: null } },
    _max: { emailSentAt: true },
  });
  const lastSentByUser = new Map(
    lastSent.map((r) => [r.userId, r._max.emailSentAt]),
  );

  let sentUsers = 0;
  let sentNotifications = 0;
  for (const [userId, items] of byUser) {
    const email = items[0]?.user.email;
    if (!email) continue;
    if (!isDigestDue(now, lastSentByUser.get(userId) ?? null, settings)) {
      continue;
    }

    // **送る前に印を付ける。** 途中で落ちたときに同じ内容を配り直すより、
    // 1 周ぶん遅れる方がよい（通知そのものはアプリ内に残っていて消えない）。
    // 送信に失敗したら印を戻すので、次の周期で拾い直せる。
    const ids = items.map((i) => i.id);
    const claimed = await prisma.notification.updateMany({
      where: { id: { in: ids }, emailSentAt: null },
      data: { emailSentAt: now },
    });
    // 0 件 = ローリングデプロイ中の旧コンテナなど、別の掃き出しが先に取った。
    if (claimed.count === 0) continue;
    // 一部だけ取れた（相手が先に何件か印を付けた）ときは、**自分が取れた分だけ**
    // 送る。全件を送ると取れなかった分が相手からも届いて二重になる。
    let mine = items;
    if (claimed.count !== ids.length) {
      const got = await prisma.notification.findMany({
        where: { id: { in: ids }, emailSentAt: now },
        select: { id: true },
      });
      const gotIds = new Set(got.map((g) => g.id));
      mine = items.filter((i) => gotIds.has(i.id));
      if (mine.length === 0) continue;
    }
    const mineIds = mine.map((i) => i.id);

    const { shown, omittedCount } = splitDigestItems(mine, settings);
    const base = appBaseUrl();
    // 受取人（この人）の言語で送る — 見積書等の書類と同じ「宛先の言語」の原則。
    const locale = normalizeLocale(items[0]?.user.locale);
    const ok = await sendNotificationDigestMail({
      to: email,
      subject: digestSubject(mine.length, locale),
      omittedCount,
      allUrl: `${base}/notifications`,
      locale,
      items: shown.map((i) => ({
        typeLabel: notificationTypeLabel(i.type, locale),
        title: i.title,
        message: i.message,
        // 中継 URL — 開いた時点で既読になり、対象ページへ送られる。
        url: `${base}${notificationOpenPath(i.id)}`,
        at: documentFormatters.dateTime(i.createdAt),
      })),
    });
    if (!ok) {
      await prisma.notification.updateMany({
        where: { id: { in: mineIds }, emailSentAt: now },
        data: { emailSentAt: null },
      });
      continue;
    }
    sentUsers += 1;
    sentNotifications += mine.length;
  }
  return { users: sentUsers, notifications: sentNotifications };
}

/**
 * 即時送信したぶんに印を付ける（ダイジェストで二度目が届かないように）。
 * notify() の即時メール経路から呼ぶ。
 */
export async function markNotificationsEmailed(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.notification.updateMany({
    where: { id: { in: ids }, emailSentAt: null },
    data: { emailSentAt: new Date() },
  });
}
