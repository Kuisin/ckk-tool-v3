"use client";

/**
 * SY0I の一覧 + 作成・有効化 / 無効化・トークンの発行と失効。
 *
 * **発行したトークンは 1 回だけ表示する。** 閉じたらどこからも読めない
 * （DB は sha256 のみ）。ポータルのバックアップコードと同じ扱い。
 */

import {
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createApiClientAction,
  issueApiTokenAction,
  revokeApiTokenAction,
  setApiClientActiveAction,
} from "@/app/(dashboard)/settings/api-clients/actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { ActionResult } from "@/lib/server-action";

export interface ApiTokenView {
  id: string;
  last4: string;
  label: string | null;
  expiresAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  revoked: boolean;
}

export interface ApiClientView {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  revoked: boolean;
  username: string;
  roles: string[];
  activeTokenCount: number;
  allowedCidrs: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  tokens: ApiTokenView[];
}

interface Props {
  clients: ApiClientView[];
  canIssueToken: boolean;
  canActivate: boolean;
}

export function ApiClientsTable({
  clients,
  canIssueToken,
  canActivate,
}: Props) {
  const tr = useTranslations();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cidrs, setCidrs] = useState("");
  /** 発行直後の生トークン。閉じたら二度と出ない。 */
  const [issued, setIssued] = useState<{ raw: string; name: string } | null>(
    null,
  );

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        notifications.show({
          color: "red",
          message: r.error,
          title: tr("common.error"),
        });
      }
    });
  }

  function create() {
    start(async () => {
      const r = await createApiClientAction({
        allowedCidrs: cidrs,
        description: description || null,
        name,
      });
      if (r.ok) {
        setCreating(false);
        setName("");
        setDescription("");
        setCidrs("");
        notifications.show({ color: "green", message: tr("common.created") });
      } else {
        notifications.show({
          color: "red",
          message: r.error,
          title: tr("common.error"),
        });
      }
    });
  }

  function issue(client: ApiClientView) {
    start(async () => {
      const r = await issueApiTokenAction(client.id, {});
      if (r.ok) {
        setIssued({ name: client.name, raw: r.data.raw });
      } else {
        notifications.show({
          color: "red",
          message: r.error,
          title: tr("common.error"),
        });
      }
    });
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text c="dimmed" size="sm">
          {tr("apiClients.intro")}
        </Text>
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          {tr("common.new")}
        </Button>
      </Group>

      <Table highlightOnHover striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{tr("common.name")}</Table.Th>
            <Table.Th>{tr("common.status")}</Table.Th>
            <Table.Th>{tr("apiClients.roles")}</Table.Th>
            <Table.Th>{tr("apiClients.tokens")}</Table.Th>
            <Table.Th>{tr("apiClients.lastUsed")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {clients.map((c) => (
            <Table.Tr key={c.id}>
              <Table.Td>
                <Stack gap={2}>
                  <Text fw={600} size="sm">
                    {c.name}
                  </Text>
                  <Text c="dimmed" ff="mono" size="xs">
                    {c.username}
                  </Text>
                </Stack>
              </Table.Td>
              <Table.Td>
                {c.revoked ? (
                  <Badge color="red" variant="light">
                    {tr("apiClients.revoked")}
                  </Badge>
                ) : c.isActive ? (
                  <Badge color="green" variant="light">
                    {tr("common.enabled")}
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light">
                    {tr("common.disabled")}
                  </Badge>
                )}
              </Table.Td>
              <Table.Td>
                {c.roles.length === 0 ? (
                  // ロールが無い = 何も読めない。SY01 で付けるまでは身元だけ。
                  <Tooltip label={tr("apiClients.noRolesHint")}>
                    <Badge color="orange" variant="light">
                      {tr("apiClients.noRoles")}
                    </Badge>
                  </Tooltip>
                ) : (
                  <Group gap={4}>
                    {c.roles.map((r) => (
                      <Badge key={r} size="sm" variant="outline">
                        {r}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm">{c.activeTokenCount} / 2</Text>
              </Table.Td>
              <Table.Td>
                <Text c="dimmed" size="xs">
                  {c.lastUsedAt
                    ? fmt.dateTime(new Date(c.lastUsedAt))
                    : tr("apiClients.neverUsed")}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Button
                    disabled={pending || !canIssueToken || c.revoked}
                    onClick={() => issue(c)}
                    size="xs"
                    variant="default"
                  >
                    {tr("apiClients.issueToken")}
                  </Button>
                  <Button
                    disabled={
                      pending || c.revoked || (!c.isActive && !canActivate)
                    }
                    onClick={() =>
                      run(() => setApiClientActiveAction(c.id, !c.isActive))
                    }
                    size="xs"
                    variant="default"
                  >
                    {c.isActive ? tr("common.disable") : tr("common.enable")}
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {clients.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" py="md" size="sm" ta="center">
                  {tr("apiClients.empty")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      {clients.some((c) => c.tokens.length > 0) && (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            {tr("apiClients.tokens")}
          </Text>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{tr("common.name")}</Table.Th>
                <Table.Th>{tr("apiClients.token")}</Table.Th>
                <Table.Th>{tr("apiClients.lastUsed")}</Table.Th>
                <Table.Th>{tr("common.status")}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {clients.flatMap((c) =>
                c.tokens.map((t) => (
                  <Table.Tr key={t.id}>
                    <Table.Td>
                      <Text size="sm">{c.name}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Code>{`••••••${t.last4}`}</Code>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="xs">
                        {t.lastUsedAt
                          ? fmt.dateTime(new Date(t.lastUsedAt))
                          : tr("apiClients.neverUsed")}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {t.revoked ? (
                        <Badge color="red" variant="light">
                          {tr("apiClients.revoked")}
                        </Badge>
                      ) : (
                        <Badge color="green" variant="light">
                          {tr("common.enabled")}
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group justify="flex-end">
                        <Button
                          color="red"
                          disabled={pending || t.revoked}
                          onClick={() => run(() => revokeApiTokenAction(t.id))}
                          size="xs"
                          variant="subtle"
                        >
                          {tr("apiClients.revoke")}
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                )),
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      )}

      <Modal
        onClose={() => setCreating(false)}
        opened={creating}
        title={tr("apiClients.createTitle")}
      >
        <Stack gap="sm">
          <TextInput
            label={tr("common.name")}
            onChange={(e) => setName(e.currentTarget.value)}
            value={name}
            withAsterisk
          />
          <Textarea
            autosize
            label={tr("common.description")}
            minRows={2}
            onChange={(e) => setDescription(e.currentTarget.value)}
            value={description}
          />
          <TextInput
            description={tr("apiClients.allowedCidrsHelp")}
            label={tr("apiClients.allowedCidrs")}
            onChange={(e) => setCidrs(e.currentTarget.value)}
            placeholder="10.0.0.0/8, 203.0.113.0/24"
            value={cidrs}
          />
          <Alert color="blue" variant="light">
            {tr("apiClients.createHint")}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={() => setCreating(false)} variant="default">
              {tr("common.cancel")}
            </Button>
            <Button disabled={!name.trim()} loading={pending} onClick={create}>
              {tr("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        onClose={() => setIssued(null)}
        opened={issued !== null}
        title={tr("apiClients.issuedTitle")}
      >
        <Stack gap="sm">
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} />}
            variant="light"
          >
            {tr("apiClients.shownOnce")}
          </Alert>
          <Text size="sm">{issued?.name}</Text>
          <Code block>{issued?.raw}</Code>
          <Group justify="flex-end">
            <Button onClick={() => setIssued(null)}>
              {tr("common.close")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
