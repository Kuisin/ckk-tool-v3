"use server";

/**
 * SY0I 外向き Webhook の Server Action（設計: `_specs/api.md` §9）。
 *
 * ■ 承認が要るのは**データを外へ出す口を作る / 広げる操作**（`api_client.webhook_manage`）
 *   送信先の追加・URL の変更・署名鍵の再発行・有効化。
 *   止める・消す・購読を狭める・テスト送信・失敗した配送の再送は
 *   素の `api_client:UPDATE` で足りる（出る量が増えない）。
 * ■ 署名鍵の生値は作成・再発行の戻り値にだけ現れる。監査行には `last4` だけ。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import {
  checkOperationPermission,
  elevationAuditNote,
  useElevation,
} from "@/lib/privileged-access";
import { ENCRYPTION_KEY_ENV } from "@/lib/secret-box";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";
import { normalizeEventTypes, validateWebhookUrl } from "@/lib/webhook-core";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  redeliver,
  rotateWebhookSecret,
  sendTestPing,
  setWebhookActive,
  updateWebhookEndpoint,
  type WebhookDeliveryRow,
  type WebhookInputError,
} from "@/lib/webhooks-admin";

const BASE_PATH = "/settings/api-clients";
type Tr = Awaited<ReturnType<typeof getTranslations>>;

function revalidate(): void {
  revalidatePath(BASE_PATH, "layout");
}

function featureOff(tr: Tr): string | null {
  return isDevFeatureEnabled("api") ? null : tr("apiClients.featureDisabled");
}

function inputError(tr: Tr, e: WebhookInputError | { code: "not-found" }) {
  switch (e.code) {
    case "url":
      return tr("apiClients.webhookInvalidUrl", { detail: e.detail });
    case "events":
      return tr("apiClients.webhookInvalidEvents");
    case "no-key":
      return tr("apiClients.webhookNoKey", { env: ENCRYPTION_KEY_ENV });
    case "client-not-found":
      return tr("apiClients.clientNotFound");
    case "duplicate-name":
      return tr("apiClients.webhookDuplicateName");
    case "not-found":
      return tr("apiClients.webhookNotFound");
  }
}

const createSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(2048),
  eventTypes: z.array(z.string()).max(200),
});

/** ★ 特権操作。送信先の追加は外への口を増やす。 */
export async function createWebhookAction(input: {
  clientId: string;
  name: string;
  url: string;
  eventTypes: string[];
}): Promise<ActionResult<{ id: string; secret: string }>> {
  const tr = await getTranslations();
  // 順序: 素の権限 → 入力の検証 → 昇格（入力が不正なまま昇格を消費しない）。
  const pre = await checkOperationPermission("api_client.webhook_manage");
  if (!pre.ok) return actionError(pre.error);
  const off = featureOff(tr);
  if (off) return actionError(off);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return actionError(tr("common.invalidInput"));

  // 昇格を消費する**前**に、入力の検査を済ませる。
  const u = validateWebhookUrl(parsed.data.url);
  if (!u.ok)
    return actionError(inputError(tr, { code: "url", detail: u.error }));
  const ev = normalizeEventTypes(parsed.data.eventTypes);
  if (!ev.ok)
    return actionError(inputError(tr, { code: "events", detail: ev.error }));

  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const elevation = await useElevation("api_client.webhook_manage");
  if (!elevation.ok) return actionError(elevation.error);

  try {
    const r = await createWebhookEndpoint({
      ...parsed.data,
      createdBy: elevation.userId,
    });
    if (!r.ok) return actionError(inputError(tr, r.error));
    await recordAudit({
      action: "CREATE",
      tableName: "webhook_endpoints",
      recordId: r.id,
      after: {
        clientId: parsed.data.clientId,
        name: parsed.data.name,
        url: u.url.origin + u.url.pathname, // 経路のトークンは残さない
        eventTypes: ev.types,
        ...elevationAuditNote(elevation, "api_client.webhook_manage"),
      },
    });
    revalidate();
    return actionOk({ id: r.id, secret: r.secret });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** ★ 特権操作。 */
export async function rotateWebhookSecretAction(
  id: string,
): Promise<ActionResult<{ secret: string }>> {
  const tr = await getTranslations();
  const pre = await checkOperationPermission("api_client.webhook_manage");
  if (!pre.ok) return actionError(pre.error);
  const off = featureOff(tr);
  if (off) return actionError(off);
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const elevation = await useElevation("api_client.webhook_manage");
  if (!elevation.ok) return actionError(elevation.error);

  try {
    const r = await rotateWebhookSecret(id);
    if (!r.ok) return actionError(inputError(tr, r.error));
    await recordAudit({
      action: "UPDATE",
      tableName: "webhook_endpoints",
      recordId: id,
      after: {
        secretRotated: true,
        last4: r.secret.slice(-4),
        ...elevationAuditNote(elevation, "api_client.webhook_manage"),
      },
    });
    revalidate();
    return actionOk({ secret: r.secret });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** URL・購読の変更。広げる側（URL 変更・購読の追加）は昇格、狭める側は素の権限。 */
export async function updateWebhookAction(
  id: string,
  input: { url?: string; eventTypes?: string[] },
): Promise<ActionResult> {
  const tr = await getTranslations();
  // 狭めるだけかどうかは現在値との比較が要る — 単純に、URL が絡むなら昇格にする。
  const needsElevation = input.url !== undefined;
  if (needsElevation) {
    const pre = await checkOperationPermission("api_client.webhook_manage");
    if (!pre.ok) return actionError(pre.error);
  } else {
    const authz = await checkPermission("api_client", "UPDATE");
    if (!authz.ok) return actionError(authz.error);
  }
  const off = featureOff(tr);
  if (off) return actionError(off);

  if (input.url !== undefined) {
    const u = validateWebhookUrl(input.url);
    if (!u.ok)
      return actionError(inputError(tr, { code: "url", detail: u.error }));
  }
  if (input.eventTypes !== undefined) {
    const ev = normalizeEventTypes(input.eventTypes);
    if (!ev.ok)
      return actionError(inputError(tr, { code: "events", detail: ev.error }));
  }

  let note: Record<string, unknown> = {};
  if (needsElevation) {
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const elevation = await useElevation("api_client.webhook_manage");
    if (!elevation.ok) return actionError(elevation.error);
    note = elevationAuditNote(elevation, "api_client.webhook_manage");
  }
  try {
    const r = await updateWebhookEndpoint(id, input);
    if (!r.ok) return actionError(inputError(tr, r.error));
    await recordAudit({
      action: "UPDATE",
      tableName: "webhook_endpoints",
      recordId: id,
      after: {
        urlChanged: input.url !== undefined,
        eventTypes: input.eventTypes,
        ...note,
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** 有効化は特権（広がる）、無効化は素の権限（減る）。 */
export async function setWebhookActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();
  let note: Record<string, unknown> = {};
  if (isActive) {
    const pre = await checkOperationPermission("api_client.webhook_manage");
    if (!pre.ok) return actionError(pre.error);
    const off = featureOff(tr);
    if (off) return actionError(off);
    // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
    const elevation = await useElevation("api_client.webhook_manage");
    if (!elevation.ok) return actionError(elevation.error);
    note = elevationAuditNote(elevation, "api_client.webhook_manage");
  } else {
    const authz = await checkPermission("api_client", "UPDATE");
    if (!authz.ok) return actionError(authz.error);
  }
  try {
    const ok = await setWebhookActive(id, isActive);
    if (!ok) return actionError(tr("apiClients.webhookNotFound"));
    await recordAudit({
      action: "UPDATE",
      tableName: "webhook_endpoints",
      recordId: id,
      before: { isActive: !isActive },
      after: { isActive, ...note },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const ok = await deleteWebhookEndpoint(id);
    if (!ok) return actionError(tr("apiClients.webhookNotFound"));
    await recordAudit({
      action: "DELETE",
      tableName: "webhook_endpoints",
      recordId: id,
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.deleteFailed"), tr));
  }
}

/** テスト送信。出る量は増えない（購読にも配送表にも触れない）ので素の権限。 */
export async function testWebhookAction(id: string): Promise<
  ActionResult<{
    delivered: boolean;
    status: number | null;
    error: string | null;
  }>
> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const off = featureOff(tr);
  if (off) return actionError(off);
  const r = await sendTestPing(id);
  if (!r.ok) {
    return actionError(
      r.error === "not-found"
        ? tr("apiClients.webhookNotFound")
        : tr("apiClients.webhookSecretUnavailable"),
    );
  }
  return actionOk({
    delivered: r.delivered,
    status: r.status,
    error: r.error,
  });
}

export async function redeliverWebhookAction(
  deliveryId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const ok = await redeliver(deliveryId);
  if (!ok) return actionError(tr("apiClients.webhookNotRedeliverable"));
  revalidate();
  return actionOk();
}

export interface DeliveryView {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  nextAttemptAt: string;
  deliveredAt: string | null;
  createdAt: string;
}

export async function listWebhookDeliveriesAction(
  endpointId: string,
): Promise<ActionResult<{ rows: DeliveryView[] }>> {
  const authz = await checkPermission("api_client", "READ");
  if (!authz.ok) return actionError(authz.error);
  const rows: WebhookDeliveryRow[] = await listWebhookDeliveries(endpointId);
  return actionOk({
    rows: rows.map((r) => ({
      ...r,
      nextAttemptAt: r.nextAttemptAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
