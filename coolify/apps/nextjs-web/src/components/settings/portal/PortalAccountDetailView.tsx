"use client";

/**
 * SY0H アカウント詳細の中身 — 概要 / 共有範囲 / 発行済みリンク / 閲覧記録。
 *
 * 表は 4 つとも「読んで点検する」ためのもので、並べ替えも列の出し入れも要らない
 * （社内の DataTable は載せない）。狭い画面では表をやめて 1 行 = 1 ブロックに
 * する（design.md §20.2）。
 *
 * 操作は**アクセスを減らすもの**だけ置く: 共有範囲の失効・リンクの失効。
 * 有効化とバックアップコードの発行は一覧の側（SY0G の承認が要る）。
 */

import {
  Badge,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { type ReactNode, useTransition } from "react";
import {
  revokeLink,
  revokePortalGrant,
} from "@/app/(dashboard)/settings/portal/actions";
import { PortalGuideButton } from "@/components/settings/portal/PortalGuideButton";
import { DangerButton } from "@/components/ui/buttons";
import { useIsMobile } from "@/hooks/useViewport";
import type { PortalAccountDetail } from "@/lib/portal-admin";

/** リンク行。日付は page.tsx が ISO 文字列に落として渡す。 */
export interface PortalLinkView {
  id: string;
  resourceType: string;
  resourceId: string;
  policy: string;
  label: string | null;
  maskedEmail: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function minute(iso: string | null): string {
  return iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : "—";
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text c="dimmed" size="xs">
        {label}
      </Text>
      <Text fw={500} size="sm">
        {value}
      </Text>
    </Stack>
  );
}

/** 見出し + 中身。0 件のときは表を出さず 1 行で言う。 */
function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <Stack gap="xs">
      <Title order={5}>{title}</Title>
      {count === 0 ? (
        <Text c="dimmed" size="sm">
          {empty}
        </Text>
      ) : (
        children
      )}
    </Stack>
  );
}

export function PortalAccountDetailView({
  account,
  links,
}: {
  account: PortalAccountDetail;
  links: PortalLinkView[];
}) {
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const [pending, start] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await action();
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
    });
  }

  /** 失効は取り消せないので必ず確認を挟む（design.md §16.2）。 */
  function confirmRevoke(
    body: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    modals.openConfirmModal({
      title: tr("common.revoke2"),
      children: <Text size="sm">{body}</Text>,
      labels: { confirm: tr("common.revoke2"), cancel: tr("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => run(action),
    });
  }

  const liveGrants = account.grants.filter((g) => !g.revokedAt);

  return (
    <Stack gap="lg">
      {/* 案内 PDF — この 1 名ぶんと、同じ取引先の全員ぶん。未有効化の
          アカウントは発行できない（案内を渡してもログインできない）。 */}
      {account.isActive ? (
        <Group gap="xs" wrap="wrap">
          <PortalGuideButton
            accountId={account.id}
            label={tr("settings.portalGuide.guideForThisContact")}
          />
          <PortalGuideButton
            bpId={account.bpId}
            label={tr("settings.portalGuide.guideForAllContacts")}
          />
        </Group>
      ) : null}

      <Card padding="lg" radius="md" withBorder>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          <Field label={tr("common.contactName")} value={account.displayName} />
          <Field
            label={tr("common.emailAddress")}
            value={account.maskedEmail}
          />
          <Field label={tr("common.businessPartners")} value={account.bpName} />
          <Field
            label={tr("common.status")}
            value={
              <Badge
                color={account.isActive ? "green" : "gray"}
                size="sm"
                variant="light"
              >
                {account.isActive
                  ? tr("common.enabled")
                  : tr("common.disabled")}
              </Badge>
            }
          />
          <Field
            label={tr("common.lastLogin")}
            value={minute(account.lastLoginAt)}
          />
          <Field
            label={tr("common.createdOn")}
            value={day(account.createdAt)}
          />
        </SimpleGrid>
      </Card>

      <Section
        count={liveGrants.length}
        empty={tr("settings.portal.noSharingYet")}
        title={tr("settings.portal.sharingScope")}
      >
        <Stack gap="xs">
          {liveGrants.map((g) => (
            <Card key={g.id} padding="sm" radius="md" withBorder>
              <Group gap="sm" justify="space-between" wrap="wrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap="xs">
                    <Badge size="sm" variant="light">
                      {g.kind}
                    </Badge>
                    <Text fw={500} size="sm">
                      {g.bpName ?? g.resourceId ?? "—"}
                    </Text>
                  </Group>
                  <Text c="dimmed" size="xs">
                    {[
                      g.includeBranches
                        ? tr("settings.portal.includesBranches")
                        : null,
                      g.includeAsEndUser
                        ? tr("settings.portal.includesEndUserDocuments")
                        : null,
                      g.expiresAt
                        ? `${tr("common.validUntil2")} ${day(g.expiresAt)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </Text>
                </Stack>
                <DangerButton
                  loading={pending}
                  onClick={() =>
                    confirmRevoke(
                      tr("settings.portal.revokingSharingHidesThoseDocuments"),
                      () => revokePortalGrant(g.id),
                    )
                  }
                  size="compact-sm"
                  variant="outline"
                >
                  {tr("common.revoke2")}
                </DangerButton>
              </Group>
            </Card>
          ))}
        </Stack>
      </Section>

      <Section
        count={links.length}
        empty={tr("settings.portal.noLinksIssuedYet")}
        title={tr("settings.portal.issuedLinks")}
      >
        <Stack gap="xs">
          {links.map((l) => (
            <Card key={l.id} padding="sm" radius="md" withBorder>
              <Group gap="sm" justify="space-between" wrap="wrap">
                <Stack gap={2} style={{ minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge
                      color={l.policy === "VERIFY" ? "green" : "orange"}
                      size="sm"
                      variant="light"
                    >
                      {l.policy === "VERIFY"
                        ? tr("settings.portal.verified")
                        : tr("settings.portal.linkOnly")}
                    </Badge>
                    <Text ff="monospace" size="sm">
                      {l.resourceId}
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
                      date: day(l.expiresAt),
                    })}
                  </Text>
                </Stack>
                {l.revokedAt ? null : (
                  <DangerButton
                    loading={pending}
                    onClick={() =>
                      confirmRevoke(
                        tr("settings.portal.revokingTheLinkClosesTheSession"),
                        () => revokeLink(l.id),
                      )
                    }
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
      </Section>

      <Section
        count={account.recentAccess.length}
        empty={tr("settings.portal.nothingHasBeenViewedYet")}
        title={tr("settings.portal.viewingHistory")}
      >
        {isMobile ? (
          <Stack gap={0}>
            {account.recentAccess.map((a, i) => (
              <div key={a.id}>
                {i > 0 ? <Divider /> : null}
                <Stack gap={2} py="sm">
                  <Text ff="monospace" fw={600} size="sm">
                    {a.resourceId}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {`${a.resourceType} · ${a.action} · ${minute(a.createdAt)}`}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {a.ipAddress ?? "—"}
                  </Text>
                </Stack>
              </div>
            ))}
          </Stack>
        ) : (
          <Table highlightOnHover striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.dateAndTime")}</Table.Th>
                <Table.Th>{tr("common.type2")}</Table.Th>
                <Table.Th>{tr("common.documentNumber")}</Table.Th>
                <Table.Th>{tr("common.actions")}</Table.Th>
                <Table.Th>{tr("settings.portal.ipAddress")}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {account.recentAccess.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text size="sm">{minute(a.createdAt)}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {a.resourceType}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ff="monospace" size="sm">
                      {a.resourceId}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{a.action}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" ff="monospace" size="sm">
                      {a.ipAddress ?? "—"}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Section>
    </Stack>
  );
}
