/**
 * webhook-dispatcher.ts — 外向き Webhook の積み込みと配送。server-only.
 *
 * `instrumentation.ts` の setInterval が `runWebhookTick()` を呼ぶ（締日オート
 * ラン・取込ポーラー・通知ダイジェストと同じ流儀。BullMQ は入れていない）。
 * 1 回の刻みは 2 段:
 *
 *   1. **積む**（`enqueueFromAudit`）— `audit_logs.id` のカーソルを進め、購読に
 *      合う行を `webhook_deliveries` へ。業務コードは Webhook を知らない。
 *   2. **送る**（`deliverDue`）— 期限の来た配送を取り、署名して POST、結果を記録。
 *
 * 設計の理由は `_specs/api.md` §9。ここには**ここでしか分からない罠**だけ書く。
 *
 * ■ 監査行は**少し寝かせてから**読む（`SETTLE_SECONDS`）
 * `audit_logs.id` は挿入時に採番され、コミットは少し遅れる。id 101 が 100 より
 * 先にコミットすると、カーソルが 101 まで進んだあと 100 が現れて**永久に落ちる**。
 * 数秒より新しい行は次の刻みへ回して、その窓を塞ぐ。
 *
 * ■ 配送の取り合いは DB で解く
 * `FOR UPDATE SKIP LOCKED` で借り（リース）を取る。ローリングデプロイで旧・新の
 * 2 コンテナが同時に刻んでも、同じ配送を 2 度送らない。積む処理も
 * `(endpoint, audit_event, type)` の unique + `skipDuplicates` で冪等。
 *
 * ■ リダイレクトは追わない / 解決後のアドレスも検査する
 * 保存時の URL 検証（`validateWebhookUrl`）を通っていても、DNS は後から変わる。
 * 送る直前に名前を引き直し、ループバック・リンクローカルなら送らない。
 */

import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import {
  buildPermissionSet,
  decide,
  loadPermissionRows,
  loadScopeContext,
} from "@ckk/authz-core";
import { prisma } from "./db";
import { isDevFeatureEnabled } from "./dev-features";
import { openSecret } from "./secret-box";
import {
  AUTO_DISABLE_AFTER,
  buildEventPayload,
  eventTypesForAudit,
  isBlockedAddress,
  isSuccessStatus,
  nextDelaySec,
  resourceOfEventType,
  subscribes,
  summarizeError,
  validateWebhookUrl,
  WEBHOOK_RESOURCES,
  webhookHeaders,
} from "./webhook-core";

const CURSOR_KEY = "webhook.cursor";
/** この秒数より新しい監査行は読まない（コミット順の入れ替わりを待つ）。 */
const SETTLE_SECONDS = 5;
const ENQUEUE_BATCH = 500;
const DELIVER_BATCH = 20;
/** 1 回の POST の上限。受け側が遅いだけで刻みが詰まらないように。 */
const REQUEST_TIMEOUT_MS = 10_000;
/** 借りた配送が戻ってくるまで（クラッシュ時の取り戻し）。 */
const LEASE_SECONDS = 120;

export const webhookSecretAad = (endpointId: string) => `webhook:${endpointId}`;

let running = false;

/** 1 刻み。再入しない（前の刻みが長引いても重ならない）。 */
export async function runWebhookTick(): Promise<void> {
  if (running || !isDevFeatureEnabled("api")) return;
  running = true;
  try {
    await enqueueFromAudit();
    await deliverDue();
  } finally {
    running = false;
  }
}

// ── 権限（送る時点で引き直す）────────────────────────────────────────────

type CanRead = (userId: string, permission: string) => Promise<boolean>;

/** 刻みの間だけ生きる権限キャッシュ（ユーザーごとに 2 クエリ）。 */
function makeCanRead(): CanRead {
  const cache = new Map<
    string,
    Promise<{
      set: ReturnType<typeof buildPermissionSet>;
      scope: Awaited<ReturnType<typeof loadScopeContext>>;
    }>
  >();
  return async (userId, permission) => {
    let entry = cache.get(userId);
    if (!entry) {
      entry = (async () => ({
        set: buildPermissionSet(await loadPermissionRows(prisma, userId)),
        scope: await loadScopeContext(prisma, userId),
      }))();
      cache.set(userId, entry);
    }
    const { set, scope } = await entry;
    return decide(set, scope, permission, "READ").allowed;
  };
}

// ── 1. 積む ──────────────────────────────────────────────────────────────

async function readCursor(): Promise<bigint> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: CURSOR_KEY },
  });
  const v = (row?.value as { lastAuditId?: string } | null)?.lastAuditId;
  if (v && /^\d+$/.test(v)) return BigInt(v);
  // 初回: **いまから**。過去の監査行を全部送り直さない。
  const max = await prisma.auditLog.aggregate({ _max: { id: true } });
  const start = max._max.id ?? BigInt(0);
  await writeCursor(start);
  return start;
}

async function writeCursor(id: bigint): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: CURSOR_KEY },
    create: {
      key: CURSOR_KEY,
      value: { lastAuditId: id.toString() },
      description: "Webhook dispatcher cursor (audit_logs.id)",
    },
    update: { value: { lastAuditId: id.toString() } },
  });
}

export async function enqueueFromAudit(): Promise<number> {
  const cursor = await readCursor();
  const rows = await prisma.auditLog.findMany({
    where: {
      id: { gt: cursor },
      createdAt: { lt: new Date(Date.now() - SETTLE_SECONDS * 1_000) },
      action: { in: ["CREATE", "UPDATE", "DELETE"] },
    },
    orderBy: { id: "asc" },
    take: ENQUEUE_BATCH,
  });
  if (rows.length === 0) return 0;

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      isActive: true,
      client: { isActive: true, revokedAt: null, user: { isActive: true } },
    },
    select: {
      id: true,
      eventTypes: true,
      client: { select: { userId: true } },
    },
  });

  const canRead = makeCanRead();
  const tables = new Set(WEBHOOK_RESOURCES.map((r) => r.table));
  const data: {
    endpointId: string;
    auditEventId: bigint;
    eventType: string;
    payload: string;
  }[] = [];

  for (const row of rows) {
    if (!tables.has(row.tableName)) continue;
    const types = eventTypesForAudit(row);
    for (const type of types) {
      const res = resourceOfEventType(type);
      if (!res) continue;
      let payload: string | null = null;
      for (const ep of endpoints) {
        if (!subscribes(ep.eventTypes, type)) continue;
        if (!(await canRead(ep.client.userId, res.permission))) continue;
        payload ??= JSON.stringify(buildEventPayload(row, type));
        data.push({
          endpointId: ep.id,
          auditEventId: row.id,
          eventType: type,
          payload,
        });
      }
    }
  }

  const lastId = rows[rows.length - 1]?.id ?? cursor;
  await prisma.$transaction([
    prisma.webhookDelivery.createMany({ data, skipDuplicates: true }),
    prisma.systemSetting.upsert({
      where: { key: CURSOR_KEY },
      create: {
        key: CURSOR_KEY,
        value: { lastAuditId: lastId.toString() },
        description: "Webhook dispatcher cursor (audit_logs.id)",
      },
      update: { value: { lastAuditId: lastId.toString() } },
    }),
  ]);
  return data.length;
}

// ── 2. 送る ──────────────────────────────────────────────────────────────

/** 期限の来た配送を借りる（リース）。`SKIP LOCKED` で他の刻みと取り合わない。 */
async function claimDue(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE app.webhook_deliveries
       SET next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS})
     WHERE id IN (
       SELECT id FROM app.webhook_deliveries
        WHERE status = 'PENDING' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${DELIVER_BATCH}
        FOR UPDATE SKIP LOCKED
     )
    RETURNING id::text AS id`;
  return rows.map((r) => r.id);
}

export async function deliverDue(): Promise<number> {
  const ids = await claimDue();
  if (ids.length === 0) return 0;
  const canRead = makeCanRead();
  // 同じ送信先への配送は直列、別の送信先は並列（遅い 1 社が全体を止めない）。
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "asc" },
    include: {
      endpoint: { include: { client: { select: { userId: true } } } },
    },
  });
  const byEndpoint = new Map<string, typeof deliveries>();
  for (const d of deliveries) {
    const list = byEndpoint.get(d.endpointId) ?? [];
    list.push(d);
    byEndpoint.set(d.endpointId, list);
  }
  await Promise.all(
    [...byEndpoint.values()].map(async (list) => {
      for (const d of list) await deliverOne(d, canRead);
    }),
  );
  return deliveries.length;
}

type DeliveryWithEndpoint = Awaited<
  ReturnType<
    typeof prisma.webhookDelivery.findMany<{
      include: {
        endpoint: { include: { client: { select: { userId: true } } } };
      };
    }>
  >
>[number];

export interface SendOutcome {
  ok: boolean;
  status: number | null;
  error: string | null;
}

/** 実際の POST。配送行を触らない（テスト送信からも使う）。 */
export async function sendSigned(args: {
  url: string;
  secret: string;
  messageId: string;
  body: string;
}): Promise<SendOutcome> {
  const check = validateWebhookUrl(args.url);
  if (!check.ok) return { ok: false, status: null, error: check.error };

  const host = check.url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) === 0) {
    try {
      const addrs = await lookup(host, { all: true });
      if (
        addrs.length === 0 ||
        addrs.some((a) => isBlockedAddress(a.address))
      ) {
        return {
          ok: false,
          status: null,
          error: "resolved to a blocked address",
        };
      }
    } catch (e) {
      return { ok: false, status: null, error: summarizeError(e) };
    }
  }

  try {
    const res = await fetch(check.url, {
      method: "POST",
      headers: webhookHeaders(
        args.secret,
        args.messageId,
        Math.floor(Date.now() / 1_000),
        args.body,
      ),
      body: args.body,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 応答本文は読まない・保存しない（相手の内部情報が混ざりうる）。
    await res.body?.cancel().catch(() => undefined);
    if (isSuccessStatus(res.status)) {
      return { ok: true, status: res.status, error: null };
    }
    return {
      ok: false,
      status: res.status,
      error:
        res.status >= 300 && res.status < 400
          ? `redirect (${res.status}) is not followed`
          : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: null, error: summarizeError(e) };
  }
}

async function deliverOne(
  d: DeliveryWithEndpoint,
  canRead: CanRead,
): Promise<void> {
  const ep = d.endpoint;

  // 送信先が止められた / 権限が外れた: 送らずに打ち切る（記録は残る）。
  const res = resourceOfEventType(d.eventType);
  const abort = async (reason: string) => {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: { status: "FAILED", lastError: reason, nextAttemptAt: new Date() },
    });
  };
  if (!ep.isActive) return abort("endpoint is disabled");
  if (res && !(await canRead(ep.client.userId, res.permission))) {
    return abort("client no longer has permission to read this resource");
  }

  const opened = openSecret(ep.secret, webhookSecretAad(ep.id));
  if (!opened.ok) {
    // 鍵の問題は宛先のせいではない — 回数を消費せず、次の刻みでも試す。
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        lastError: `secret unavailable (${opened.reason})`,
        nextAttemptAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return;
  }

  const outcome = await sendSigned({
    url: ep.url,
    secret: opened.secret,
    messageId: messageIdOf(d),
    body: d.payload,
  });
  const attempts = d.attempts + 1;

  if (outcome.ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: d.id },
        data: {
          status: "SUCCEEDED",
          attempts,
          lastStatus: outcome.status,
          lastError: null,
          deliveredAt: new Date(),
        },
      }),
      prisma.webhookEndpoint.update({
        where: { id: ep.id },
        data: { consecutiveFailures: 0, lastDeliveredAt: new Date() },
      }),
    ]);
    return;
  }

  const delay = nextDelaySec(attempts);
  if (delay !== null) {
    await prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        attempts,
        lastStatus: outcome.status,
        lastError: outcome.error,
        nextAttemptAt: new Date(Date.now() + delay * 1_000),
      },
    });
    return;
  }

  // 尽きた。連続して尽きたら送信先ごと止める（死んだ宛先に積み続けない）。
  const failures = ep.consecutiveFailures + 1;
  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: "FAILED",
        attempts,
        lastStatus: outcome.status,
        lastError: outcome.error,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: ep.id },
      data:
        failures >= AUTO_DISABLE_AFTER
          ? {
              consecutiveFailures: failures,
              isActive: false,
              disabledAt: new Date(),
              disabledReason: `auto-disabled after ${failures} consecutive failed deliveries`,
            }
          : { consecutiveFailures: failures },
    }),
  ]);
}

/** `webhook-id` ヘッダ。ペイロードの `id` と同じ（再送でも不変）。 */
function messageIdOf(d: { payload: string; id: string }): string {
  try {
    const id = (JSON.parse(d.payload) as { id?: unknown }).id;
    if (typeof id === "string" && id) return id;
  } catch {
    // 壊れた本文は配送 id で代用
  }
  return `msg_${d.id}`;
}
