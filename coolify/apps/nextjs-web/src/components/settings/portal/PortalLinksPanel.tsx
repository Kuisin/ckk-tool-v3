"use client";

/**
 * SY0H 一覧の「書類リンク」— 発行済みの書類リンクを**アカウントを問わず**並べる。
 *
 * アカウント詳細の一覧は `portal_account_id` で引くので、アカウントに紐づかない
 * リンク（書類詳細の「ポータル共有」で宛先アドレスだけを指定したもの、見積書の
 * メール送付で発行したもの）はそこに出ない。失効できる場所が無いリンクを作らない
 * ために、ここで全件（直近 100 件）を見せる。
 *
 * 置く操作は失効だけ（アクセスを減らす操作。承認は要らない）。
 */

import { Badge, Card, Group, Stack, Text, Title } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { revokeLink } from "@/app/(dashboard)/settings/portal/actions";
import { DangerButton } from "@/components/ui/buttons";
import { docNo } from "@/lib/doc-number";
import {
  isPortalDocumentType,
  portalDocumentLabel,
} from "@/lib/portal-documents-core";
import type { PortalLinkView } from "./PortalAccountDetailView";

export function PortalLinksPanel({ links }: { links: PortalLinkView[] }) {
  const tr = useTranslations();
  const [pending, start] = useTransition();

  function revoke(id: string) {
    modals.openConfirmModal({
      title: tr("common.revoke2"),
      children: (
        <Text size="sm">
          {tr("settings.portal.revokingTheLinkClosesTheSession")}
        </Text>
      ),
      labels: { confirm: tr("common.revoke2"), cancel: tr("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        start(async () => {
          const res = await revokeLink(id);
          notifications.show(
            res.ok
              ? {
                  color: "green",
                  message: tr("settings.portal.revoked"),
                  title: tr("common.completed"),
                }
              : {
                  color: "red",
                  message: res.error ?? tr("common.failed"),
                  title: tr("common.error2"),
                },
          );
        }),
    });
  }

  return (
    <Stack gap="xs">
      <Title order={5}>{tr("settings.portal.documentLinks")}</Title>
      <Text c="dimmed" size="xs">
        {tr("settings.portal.documentLinksIntro")}
      </Text>
      {links.length === 0 ? (
        <Text c="dimmed" size="sm">
          {tr("settings.portal.noLinksIssuedYet")}
        </Text>
      ) : (
        <Stack gap="xs">
          {links.map((l) => (
            <Card key={l.id} padding="sm" radius="md" withBorder>
              <Group gap="sm" justify="space-between" wrap="wrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="wrap">
                    <Badge
                      color={l.policy === "VERIFY" ? "green" : "orange"}
                      size="sm"
                      variant="light"
                    >
                      {l.policy === "VERIFY"
                        ? tr("settings.portal.verified")
                        : tr("settings.portal.linkOnly")}
                    </Badge>
                    {isPortalDocumentType(l.resourceType) ? (
                      <Text size="sm">
                        {portalDocumentLabel(l.resourceType, tr)}
                      </Text>
                    ) : null}
                    <Text ff="monospace" size="sm">
                      {docNo(l.resourceId)}
                    </Text>
                    {l.revokedAt ? (
                      <Badge color="gray" size="sm" variant="light">
                        {tr("settings.portal.revoked")}
                      </Badge>
                    ) : null}
                  </Group>
                  <Text c="dimmed" size="xs">
                    {tr("settings.portal.linkSummary", {
                      email: l.maskedEmail ?? "—",
                      count: l.useCount,
                      date: l.expiresAt.slice(0, 10),
                    })}
                  </Text>
                </Stack>
                {l.revokedAt ? null : (
                  <DangerButton
                    loading={pending}
                    onClick={() => revoke(l.id)}
                    size="compact-sm"
                    variant="outline"
                  >
                    {tr("common.revoke2")}
                  </DangerButton>
                )}
              </Group>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
