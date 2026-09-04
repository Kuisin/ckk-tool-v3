"use client";

/**
 * SY0H のアカウント一覧 + 作成・有効化・無効化・共有範囲・バックアップコード。
 *
 * バックアップコードは**発行直後の 1 回だけ**表示する（以後どこからも読めない）。
 */

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  activatePortalAccount,
  addPortalBpScope,
  createPortalAccount,
  deactivatePortalAccount,
  issueBackupCodes,
} from "@/app/(dashboard)/settings/portal/actions";
import { PortalGuideButton } from "@/components/settings/portal/PortalGuideButton";
import type { PortalAccountRow } from "@/lib/portal-admin";

type Option = { value: string; label: string };

export function PortalAccountsTable({
  accounts,
  bpOptions,
  canActivate,
  canIssueBackup,
}: {
  accounts: PortalAccountRow[];
  bpOptions: Option[];
  canActivate?: boolean;
  canIssueBackup?: boolean;
}) {
  const tr = useTranslations();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [bpId, setBpId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [scopeBranches, setScopeBranches] = useState(true);
  const [scopeEndUser, setScopeEndUser] = useState(false);
  const [issued, setIssued] = useState<string[] | null>(null);

  function notify(res: { ok: boolean; error?: string }, ok: string) {
    if (res.ok) {
      notifications.show({
        color: "green",
        message: ok,
        title: tr("common.completed"),
      });
    } else {
      notifications.show({
        color: "red",
        message: res.error ?? tr("common.failed"),
        title: tr("common.error2"),
      });
    }
  }

  function create() {
    if (!bpId) return;
    start(async () => {
      const res = await createPortalAccount({ bpId, email, displayName });
      notify(res, tr("settings.portal.theAccountWasCreatedDisabledBy"));
      if (res.ok) {
        // 作った直後に BP スコープを 1 本入れておく（無いと何も見えない）。
        await addPortalBpScope({
          portalAccountId: res.data.id,
          bpId,
          includeBranches: scopeBranches,
          includeAsEndUser: scopeEndUser,
        });
        setCreating(false);
        setEmail("");
        setDisplayName("");
      }
    });
  }

  return (
    <Stack gap="md">
      <Group justify="flex-end">
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          {tr("common.new2")}
        </Button>
      </Group>

      <Card padding="md" radius="md" withBorder>
        <Table highlightOnHover striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("common.businessPartners")}</Table.Th>
              <Table.Th>{tr("common.assignee")}</Table.Th>
              <Table.Th>{tr("common.email")}</Table.Th>
              <Table.Th>{tr("common.status")}</Table.Th>
              <Table.Th>{tr("common.lastLogin")}</Table.Th>
              <Table.Th>{tr("common.actions")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {accounts.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Text c="dimmed" size="sm">
                    {tr("settings.portal.thereAreNoAccountsYet")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              accounts.map((a) => (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Text size="sm">{a.bpName}</Text>
                  </Table.Td>
                  <Table.Td>
                    {/* 共有範囲・閲覧記録・発行済みリンクは詳細で読む。 */}
                    <Anchor
                      component={Link}
                      href={`/settings/portal/${a.id}`}
                      size="sm"
                    >
                      {a.displayName}
                    </Anchor>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" ff="monospace" size="xs">
                      {a.maskedEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={a.isActive ? "green" : "gray"}
                      size="sm"
                      variant="light"
                    >
                      {a.isActive
                        ? tr("common.enabled")
                        : tr("common.disabled3")}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="xs">
                      {a.lastLoginAt?.slice(0, 10) ?? "—"}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {a.isActive ? (
                        <Button
                          loading={pending}
                          onClick={() =>
                            start(async () =>
                              notify(
                                await deactivatePortalAccount(
                                  a.id,
                                  tr(
                                    "settings.portal.disabledFromTheAdminScreen",
                                  ),
                                ),
                                tr("settings.portal.disabled"),
                              ),
                            )
                          }
                          size="compact-xs"
                          variant="default"
                        >
                          {tr("settings.portal.disable")}
                        </Button>
                      ) : (
                        <Button
                          disabled={!canActivate}
                          loading={pending}
                          onClick={() =>
                            start(async () =>
                              notify(
                                await activatePortalAccount(a.id),
                                tr("settings.portal.enabled"),
                              ),
                            )
                          }
                          size="compact-xs"
                          title={
                            canActivate
                              ? undefined
                              : tr(
                                  "settings.portal.enablingRequiresPrivilegedAccessSy0gApproval",
                                )
                          }
                        >
                          {tr("settings.portal.enable")}
                        </Button>
                      )}
                      {a.isActive ? (
                        <PortalGuideButton
                          accountId={a.id}
                          compact
                          label={tr("settings.portalGuide.guide")}
                        />
                      ) : null}
                      <Button
                        disabled={!canIssueBackup}
                        loading={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await issueBackupCodes(a.id);
                            if (res.ok) setIssued(res.data.codes);
                            notify(
                              res,
                              tr("settings.portal.aBackupCodeWasIssued"),
                            );
                          })
                        }
                        size="compact-xs"
                        title={
                          canIssueBackup
                            ? undefined
                            : tr(
                                "settings.portal.issuingRequiresPrivilegedAccessSy0gApproval",
                              )
                        }
                        variant="default"
                      >
                        {tr("common.backupCode")}
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))
            )}
          </Table.Tbody>
        </Table>
      </Card>

      <Modal
        onClose={() => setCreating(false)}
        opened={creating}
        title={tr("settings.portal.createAPortalAccount")}
      >
        <Stack gap="sm">
          <Select
            data={bpOptions}
            label={tr("common.businessPartners")}
            onChange={setBpId}
            searchable
            value={bpId}
            withAsterisk
          />
          <TextInput
            label={tr("common.contactName")}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            value={displayName}
            withAsterisk
          />
          <TextInput
            label={tr("common.emailAddress")}
            onChange={(e) => setEmail(e.currentTarget.value)}
            type="email"
            value={email}
            withAsterisk
          />
          <SimpleGrid cols={1} spacing="xs">
            <Checkbox
              checked={scopeBranches}
              description={tr("settings.portal.sharingAtTheParentPartnerAlso")}
              label={tr("settings.portal.includeDocumentsAddressedToBranches")}
              onChange={(e) => setScopeBranches(e.currentTarget.checked)}
            />
            <Checkbox
              checked={scopeEndUser}
              description={tr("settings.portal.theResellerSPriceMayBecome")}
              label={tr("settings.portal.alsoIncludeDocumentsWhereTheyAre")}
              onChange={(e) => setScopeEndUser(e.currentTarget.checked)}
            />
          </SimpleGrid>
          <Alert color="gray" variant="light">
            <Text size="xs">
              {tr("settings.portal.creatingItAloneShowsNothingThey")}
            </Text>
          </Alert>
          <Group justify="flex-end">
            <Button onClick={() => setCreating(false)} variant="default">
              {tr("common.cancel")}
            </Button>
            <Button
              disabled={!bpId || !email || !displayName}
              loading={pending}
              onClick={create}
            >
              {tr("common.create2")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        onClose={() => setIssued(null)}
        opened={issued !== null}
        title={tr("common.backupCode")}
      >
        <Stack gap="sm">
          <Alert color="orange" variant="light">
            <Text size="xs">
              {tr("settings.portal.onceYouCloseThisScreenIt")}
            </Text>
          </Alert>
          <Code block>{(issued ?? []).join("\n")}</Code>
          <Group justify="flex-end">
            <Button onClick={() => setIssued(null)}>
              {tr("settings.portal.closedDeclined")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
