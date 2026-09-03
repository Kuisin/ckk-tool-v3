"use client";

/**
 * 書類詳細に置く「ポータル共有」。
 *
 * 発行者がポリシーを選ぶ（利用者の判断 —「書類ごとに選べる」）。
 * **金額を含む書類で LINK_ONLY を選んだときは確認を挟む** — URL の所持だけで
 * 開けるので、転送されればその相手にも金額が見える。
 */

import {
  Alert,
  Badge,
  Button,
  Card,
  CopyButton,
  Group,
  NumberInput,
  Radio,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createLinkOnlyUrl,
  createVerifyLink,
  type PortalLinkInput,
  revokeLink,
} from "@/app/(dashboard)/settings/portal/actions";
import type { PortalDocumentType } from "@/lib/portal-documents-core";
import type { PortalLinkRow } from "@/lib/portal-links";

/** 金額が載る書類（LINK_ONLY のとき確認を挟む）。 */
const MONEY_DOCS: PortalDocumentType[] = ["invoices", "quotes"];

export function PortalShareCard({
  resourceType,
  resourceId,
  links,
  canMintLinkOnly,
}: {
  resourceType: PortalDocumentType;
  resourceId: string;
  links: PortalLinkRow[];
  canMintLinkOnly: boolean;
}) {
  const tr = useTranslations();
  const [pending, start] = useTransition();
  const [policy, setPolicy] = useState<"VERIFY" | "LINK_ONLY">("VERIFY");
  const [email, setEmail] = useState("");
  const [days, setDays] = useState<number>(30);
  const [url, setUrl] = useState<string | null>(null);

  function notify(res: { ok: boolean; error?: string }, ok: string) {
    notifications.show(
      res.ok
        ? { color: "green", message: ok, title: tr("common.completed") }
        : {
            color: "red",
            message: res.error ?? tr("common.failed"),
            title: tr("common.error2"),
          },
    );
  }

  function submit() {
    const input: PortalLinkInput = {
      resourceType,
      resourceId,
      boundEmail: policy === "VERIFY" ? email : null,
      days,
    };
    const run = () =>
      start(async () => {
        const res =
          policy === "LINK_ONLY"
            ? await createLinkOnlyUrl(input)
            : await createVerifyLink(input);
        if (res.ok) setUrl(res.data.url);
        notify(res, tr("settings.portal.theLinkWasIssued"));
      });

    if (policy === "LINK_ONLY" && MONEY_DOCS.includes(resourceType)) {
      modals.openConfirmModal({
        title: tr("settings.portal.issuesALinkWithNoIdentity"),
        children: (
          <Text size="sm">
            {tr("settings.portal.anyoneWithThisLinkCanOpen")}
          </Text>
        ),
        labels: {
          cancel: tr("common.back2"),
          confirm: tr("settings.portal.issue"),
        },
        confirmProps: { color: "red" },
        onConfirm: run,
      });
      return;
    }
    run();
  }

  return (
    <Card padding="md" radius="md" withBorder>
      <Stack gap="sm">
        <Text fw={600} size="sm">
          {tr("settings.portal.portalSharing")}
        </Text>
        <Text c="dimmed" size="xs">
          {tr("settings.portal.issuesALinkThatShowsThis")}
        </Text>

        <Radio.Group
          onChange={(v) => setPolicy(v as "VERIFY" | "LINK_ONLY")}
          value={policy}
        >
          <Stack gap={4}>
            <Radio
              description={tr("settings.portal.aVerificationCodeGoesToThe")}
              label={tr("settings.portal.withIdentityCheckRecommended")}
              value="VERIFY"
            />
            <Radio
              description={
                canMintLinkOnly
                  ? tr("settings.portal.anyoneWithTheUrlCanOpen")
                  : tr("settings.portal.privilegedAccessSy0gApprovalIsRequired")
              }
              disabled={!canMintLinkOnly}
              label={tr("settings.portal.linkOnly")}
              value="LINK_ONLY"
            />
          </Stack>
        </Radio.Group>

        {policy === "VERIFY" ? (
          <TextInput
            description={tr("settings.portal.theVerificationCodeGoesOnlyTo")}
            label={tr("settings.portal.recipientEmailAddress")}
            onChange={(e) => setEmail(e.currentTarget.value)}
            type="email"
            value={email}
          />
        ) : null}

        <NumberInput
          label={tr("settings.portal.validPeriodDays")}
          max={180}
          min={1}
          onChange={(v) => setDays(Number(v) || 30)}
          value={days}
        />

        <Group justify="flex-end">
          <Button
            disabled={policy === "VERIFY" && !email}
            loading={pending}
            onClick={submit}
          >
            {tr("settings.portal.issueALink")}
          </Button>
        </Group>

        {url ? (
          <Alert color="blue" variant="light">
            <Stack gap={4}>
              <Text size="xs">
                {tr("settings.portal.issuedHandOverThisUrl")}
              </Text>
              <Group gap="xs" wrap="nowrap">
                <Text
                  ff="monospace"
                  size="xs"
                  style={{ wordBreak: "break-all" }}
                >
                  {url}
                </Text>
                <CopyButton value={url}>
                  {({ copied, copy }) => (
                    <Button onClick={copy} size="compact-xs" variant="default">
                      {copied ? tr("common.copied") : tr("common.copy2")}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Stack>
          </Alert>
        ) : null}

        {links.length > 0 ? (
          <Stack gap={4}>
            <Text c="dimmed" size="xs">
              {tr("settings.portal.issuedLinks")}
            </Text>
            {links.map((l) => (
              <Group gap="xs" justify="space-between" key={l.id} wrap="nowrap">
                <Group gap="xs">
                  <Badge
                    color={l.policy === "VERIFY" ? "green" : "orange"}
                    size="xs"
                    variant="light"
                  >
                    {l.policy === "VERIFY"
                      ? tr("settings.portal.verified")
                      : tr("settings.portal.linkOnly")}
                  </Badge>
                  <Text c="dimmed" size="xs">
                    {tr("settings.portal.linkSummary", {
                      email: l.maskedEmail ?? "—",
                      count: l.useCount,
                      date: l.expiresAt.toISOString().slice(0, 10),
                    })}
                  </Text>
                </Group>
                {l.revokedAt ? (
                  <Badge color="gray" size="xs" variant="light">
                    {tr("settings.portal.revoked")}
                  </Badge>
                ) : (
                  <Button
                    color="red"
                    loading={pending}
                    onClick={() =>
                      start(async () =>
                        notify(await revokeLink(l.id), tr("common.revoked")),
                      )
                    }
                    size="compact-xs"
                    variant="subtle"
                  >
                    {tr("common.revoke2")}
                  </Button>
                )}
              </Group>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  );
}
