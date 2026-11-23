/**
 * SY0I API クライアント — 一覧。
 *
 * 並ぶのは人ではなく**機械**（外部システムの資格情報）。SY01 ユーザー管理に
 * 混ぜないのは、寿命も操作も違うから（発行・差し替え・失効）。
 *
 * ここで作れるのは**身元**だけ。そのクライアントが何を読めるかは SY01 で
 * backing user にロールを割り当てて決まる — 発行と権限付与を別の操作に
 * 分けるための線引き。
 */

import { Stack } from "@mantine/core";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ApiClientsTable } from "@/components/settings/api-clients/ApiClientsTable";
import { WebhooksPanel } from "@/components/settings/api-clients/WebhooksPanel";
import { PageHeader } from "@/components/ui/PageHeader";
import { listApiClients } from "@/lib/api-clients-admin";
import { requireAppRead } from "@/lib/authz-page";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { peekElevations } from "@/lib/privileged-access";
import { hasEncryptionKey } from "@/lib/secret-box";
import { listWebhookEventTypes } from "@/lib/webhook-core";
import { listWebhookEndpoints } from "@/lib/webhooks-admin";

export const dynamic = "force-dynamic";

export default async function ApiClientsPage() {
  const tr = await getTranslations();
  const denied = await requireAppRead("api-clients");
  if (denied) return denied;
  if (!isDevFeatureEnabled("api")) notFound();

  const [clients, webhooks, elevations] = await Promise.all([
    listApiClients(),
    listWebhookEndpoints(),
    // **peek** — 画面を開いただけで持ち時間を動かさない（ボタンの活性を描くだけ）。
    peekElevations([
      "api_client.issue_token",
      "api_client.activate",
      "api_client.webhook_manage",
    ]),
  ]);

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[tr("common.system"), tr("apiClients.title")]}
        title={tr("apiClients.title")}
      />
      <ApiClientsTable
        canActivate={elevations["api_client.activate"]?.allowed ?? false}
        canIssueToken={elevations["api_client.issue_token"]?.allowed ?? false}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isActive: c.isActive,
          revoked: c.revokedAt !== null,
          username: c.username,
          roles: c.roles,
          activeTokenCount: c.activeTokenCount,
          allowedCidrs: c.allowedCidrs,
          lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
          expiresAt: c.expiresAt?.toISOString() ?? null,
          tokens: c.tokens.map((t) => ({
            id: t.id,
            last4: t.last4,
            label: t.label,
            expiresAt: t.expiresAt?.toISOString() ?? null,
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            useCount: t.useCount,
            revoked: t.revokedAt !== null,
          })),
        }))}
      />
      <WebhooksPanel
        canManage={elevations["api_client.webhook_manage"]?.allowed ?? false}
        clients={clients
          .filter((c) => c.revokedAt === null)
          .map((c) => ({ id: c.id, name: c.name }))}
        encryptionKeyMissing={!hasEncryptionKey()}
        eventTypes={listWebhookEventTypes().map((e) => ({
          type: e.type,
          resource: e.resource.resource,
          summary: e.resource.summary,
        }))}
        webhooks={webhooks.map((w) => ({
          id: w.id,
          clientName: w.clientName,
          name: w.name,
          url: w.url,
          eventTypes: w.eventTypes,
          isActive: w.isActive,
          consecutiveFailures: w.consecutiveFailures,
          disabledReason: w.disabledReason,
          lastDeliveredAt: w.lastDeliveredAt?.toISOString() ?? null,
          secretLast4: w.secretLast4,
          pendingCount: w.pendingCount,
          failedCount: w.failedCount,
        }))}
      />
    </Stack>
  );
}
