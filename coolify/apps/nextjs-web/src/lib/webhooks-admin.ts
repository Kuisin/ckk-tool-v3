/**
 * webhooks-admin.ts — SY0I「外向き Webhook」の読み書き。server-only.
 *
 * 権限のチェック・特権の消費・監査行は呼び出し側（Server Action）が持つ。
 * ここは DB と、鍵（署名鍵の封筒）の取り扱いだけ。
 *
 * ■ 署名鍵は**作成・再発行の応答に 1 度だけ**現れる
 * DB には secret-box の封筒（AES-256-GCM）で持つ。画面に出せるのは下 4 桁
 * （`sealedLast4`）だけ。監査行にも生値を入れない。
 * `SETTINGS_ENCRYPTION_KEY` が無い環境では**作成そのものを拒否する**
 * （平文で持つ・別の鍵を借りる、の 2 択を作らない — AI プロバイダと同じ判断）。
 */

import "server-only";

import { Prisma } from "../../generated/client/client";
import { prisma } from "./db";
import {
  hasEncryptionKey,
  openSecret,
  sealedLast4,
  sealSecret,
} from "./secret-box";
import {
  buildPingPayload,
  generateWebhookSecret,
  normalizeEventTypes,
  PING_EVENT_TYPE,
  validateWebhookUrl,
} from "./webhook-core";
import { sendSigned, webhookSecretAad } from "./webhook-dispatcher";

export interface WebhookEndpointRow {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  consecutiveFailures: number;
  disabledAt: Date | null;
  disabledReason: string | null;
  lastDeliveredAt: Date | null;
  secretLast4: string | null;
  createdAt: Date;
  pendingCount: number;
  failedCount: number;
}

export async function listWebhookEndpoints(): Promise<WebhookEndpointRow[]> {
  const rows = await prisma.webhookEndpoint.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      client: { select: { name: true } },
      _count: { select: { deliveries: true } },
    },
  });
  if (rows.length === 0) return [];
  const counts = await prisma.webhookDelivery.groupBy({
    by: ["endpointId", "status"],
    where: {
      endpointId: { in: rows.map((r) => r.id) },
      status: { in: ["PENDING", "FAILED"] },
    },
    _count: { _all: true },
  });
  const count = (id: string, status: string) =>
    counts.find((c) => c.endpointId === id && c.status === status)?._count
      ._all ?? 0;
  return rows.map((r) => ({
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.name,
    name: r.name,
    url: r.url,
    eventTypes: r.eventTypes,
    isActive: r.isActive,
    consecutiveFailures: r.consecutiveFailures,
    disabledAt: r.disabledAt,
    disabledReason: r.disabledReason,
    lastDeliveredAt: r.lastDeliveredAt,
    secretLast4: sealedLast4(r.secret),
    createdAt: r.createdAt,
    pendingCount: count(r.id, "PENDING"),
    failedCount: count(r.id, "FAILED"),
  }));
}

export type WebhookInputError =
  | { code: "url"; detail: string }
  | { code: "events"; detail: string }
  | { code: "no-key" }
  | { code: "client-not-found" }
  | { code: "duplicate-name" };

export interface CreateWebhookInput {
  clientId: string;
  name: string;
  url: string;
  eventTypes: string[];
  createdBy: string;
}

/** 作成。生の署名鍵を**ここで 1 度だけ**返す。 */
export async function createWebhookEndpoint(
  input: CreateWebhookInput,
): Promise<
  | { ok: true; id: string; secret: string }
  | { ok: false; error: WebhookInputError }
> {
  const url = validateWebhookUrl(input.url);
  if (!url.ok) return { ok: false, error: { code: "url", detail: url.error } };
  const events = normalizeEventTypes(input.eventTypes);
  if (!events.ok) {
    return { ok: false, error: { code: "events", detail: events.error } };
  }
  if (!hasEncryptionKey()) return { ok: false, error: { code: "no-key" } };

  const client = await prisma.apiClient.findUnique({
    where: { id: input.clientId },
    select: { id: true, revokedAt: true },
  });
  if (!client || client.revokedAt) {
    return { ok: false, error: { code: "client-not-found" } };
  }

  // id が封筒の AAD に要る（貼り替え対策）ので、先に採番してから封をする。
  const id = crypto.randomUUID();
  const secret = generateWebhookSecret();
  const sealed = sealSecret(secret, webhookSecretAad(id));
  if (!sealed.ok) return { ok: false, error: { code: "no-key" } };

  try {
    await prisma.webhookEndpoint.create({
      data: {
        id,
        clientId: input.clientId,
        name: input.name.trim(),
        url: url.url.toString(),
        eventTypes: events.types,
        secret: sealed.sealed as unknown as Prisma.InputJsonValue,
        createdBy: input.createdBy,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: { code: "duplicate-name" } };
    }
    throw e;
  }
  return { ok: true, id, secret };
}

/** 署名鍵の再発行。旧い鍵は**その場で**効かなくなる（猶予は設けない — 漏えい時の操作）。 */
export async function rotateWebhookSecret(
  id: string,
): Promise<
  | { ok: true; secret: string }
  | { ok: false; error: WebhookInputError | { code: "not-found" } }
> {
  if (!hasEncryptionKey()) return { ok: false, error: { code: "no-key" } };
  const secret = generateWebhookSecret();
  const sealed = sealSecret(secret, webhookSecretAad(id));
  if (!sealed.ok) return { ok: false, error: { code: "no-key" } };
  const r = await prisma.webhookEndpoint.updateMany({
    where: { id },
    data: { secret: sealed.sealed as unknown as Prisma.InputJsonValue },
  });
  return r.count === 0
    ? { ok: false, error: { code: "not-found" } }
    : { ok: true, secret };
}

export interface UpdateWebhookInput {
  url?: string;
  eventTypes?: string[];
}

export async function updateWebhookEndpoint(
  id: string,
  input: UpdateWebhookInput,
): Promise<
  { ok: true } | { ok: false; error: WebhookInputError | { code: "not-found" } }
> {
  const data: Prisma.WebhookEndpointUpdateInput = {};
  if (input.url !== undefined) {
    const url = validateWebhookUrl(input.url);
    if (!url.ok)
      return { ok: false, error: { code: "url", detail: url.error } };
    data.url = url.url.toString();
  }
  if (input.eventTypes !== undefined) {
    const events = normalizeEventTypes(input.eventTypes);
    if (!events.ok) {
      return { ok: false, error: { code: "events", detail: events.error } };
    }
    data.eventTypes = events.types;
  }
  const r = await prisma.webhookEndpoint.updateMany({ where: { id }, data });
  return r.count === 0
    ? { ok: false, error: { code: "not-found" } }
    : { ok: true };
}

/** 有効化は失敗カウンタも戻す（自動停止からの復帰で、すぐ再停止しないように）。 */
export async function setWebhookActive(
  id: string,
  isActive: boolean,
): Promise<boolean> {
  const r = await prisma.webhookEndpoint.updateMany({
    where: { id },
    data: isActive
      ? {
          isActive: true,
          consecutiveFailures: 0,
          disabledAt: null,
          disabledReason: null,
        }
      : {
          isActive: false,
          disabledAt: new Date(),
          disabledReason: "disabled by an administrator",
        },
  });
  return r.count > 0;
}

export async function deleteWebhookEndpoint(id: string): Promise<boolean> {
  const r = await prisma.webhookEndpoint.deleteMany({ where: { id } });
  return r.count > 0;
}

export interface WebhookDeliveryRow {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: Date;
  deliveredAt: Date | null;
  createdAt: Date;
}

export async function listWebhookDeliveries(
  endpointId: string,
  limit = 50,
): Promise<WebhookDeliveryRow[]> {
  return prisma.webhookDelivery.findMany({
    where: { endpointId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      eventType: true,
      status: true,
      attempts: true,
      lastStatus: true,
      lastError: true,
      nextAttemptAt: true,
      deliveredAt: true,
      createdAt: true,
    },
  });
}

/** 失敗（打ち切り）した配送を送り直す。本文も message id も同じ — 受け側は重複排除できる。 */
export async function redeliver(deliveryId: string): Promise<boolean> {
  const r = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
  });
  return r.count > 0;
}

/**
 * テスト送信（`webhook.ping`）。その場で 1 回だけ POST して結果を返す。
 * 配送表には**積まない**（購読にも再試行にも関係させない）。
 */
export async function sendTestPing(id: string): Promise<
  | {
      ok: true;
      status: number | null;
      error: string | null;
      delivered: boolean;
    }
  | { ok: false; error: "not-found" | "no-secret" }
> {
  const ep = await prisma.webhookEndpoint.findUnique({ where: { id } });
  if (!ep) return { ok: false, error: "not-found" };
  const opened = openSecret(ep.secret, webhookSecretAad(ep.id));
  if (!opened.ok) return { ok: false, error: "no-secret" };
  const payload = buildPingPayload(crypto.randomUUID(), new Date());
  const outcome = await sendSigned({
    url: ep.url,
    secret: opened.secret,
    messageId: payload.id,
    body: JSON.stringify(payload),
  });
  return {
    ok: true,
    delivered: outcome.ok,
    status: outcome.status,
    error: outcome.error,
  };
}

export { PING_EVENT_TYPE };
