"use client";

/**
 * SY0I の「外向き Webhook」— 送信先の一覧・追加・テスト送信・配送履歴。
 *
 * **署名鍵は作成・再発行の直後に 1 度だけ表示する**（API トークンと同じ扱い）。
 * 設計は `_specs/api.md` §9。
 */

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Code,
  Drawer,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconPlus } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  createWebhookAction,
  type DeliveryView,
  deleteWebhookAction,
  listWebhookDeliveriesAction,
  redeliverWebhookAction,
  rotateWebhookSecretAction,
  setWebhookActiveAction,
  testWebhookAction,
} from "@/app/(dashboard)/settings/api-clients/webhook-actions";
import { useFormat } from "@/components/layout/PreferencesProvider";
import type { ActionResult } from "@/lib/server-action";

export interface WebhookView {
  id: string;
  clientName: string;
  name: string;
  url: string;
  eventTypes: string[];
  isActive: boolean;
  consecutiveFailures: number;
  disabledReason: string | null;
  lastDeliveredAt: string | null;
  secretLast4: string | null;
  pendingCount: number;
  failedCount: number;
}

export interface EventTypeOption {
  type: string;
  resource: string;
  summary: string;
}

interface Props {
  webhooks: WebhookView[];
  clients: { id: string; name: string }[];
  eventTypes: EventTypeOption[];
  canManage: boolean;
  encryptionKeyMissing: boolean;
}

/** URL の経路にトークンが入る（n8n の Webhook URL など）ので、一覧では経路を伏せる。 */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.origin : `${u.origin}/…`;
  } catch {
    return url;
  }
}

export function WebhooksPanel({
  webhooks,
  clients,
  eventTypes,
  canManage,
  encryptionKeyMissing,
}: Props) {
  const tr = useTranslations();
  const fmt = useFormat();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 作成・再発行の直後の署名鍵。閉じたら二度と出ない。 */
  const [issued, setIssued] = useState<{ name: string; secret: string } | null>(
    null,
  );
  const [history, setHistory] = useState<{
    id: string;
    name: string;
    rows: DeliveryView[];
  } | null>(null);

  const fail = (message: string): void => {
    notifications.show({
      color: "red",
      message,
      title: tr("common.error"),
    });
  };

  function run(fn: () => Promise<ActionResult>) {
    start(async () => {
      const r = await fn();
      if (!r.ok) fail(r.error);
    });
  }

  function toggleType(type: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(type);
      else next.delete(type);
      return next;
    });
  }

  function create() {
    if (!clientId) return;
    start(async () => {
      const r = await createWebhookAction({
        clientId,
        eventTypes: [...selected],
        name,
        url,
      });
      if (!r.ok) return fail(r.error);
      setCreating(false);
      setIssued({ name, secret: r.data.secret });
      setName("");
      setUrl("");
      setSelected(new Set());
    });
  }

  function rotate(w: WebhookView) {
    modals.openConfirmModal({
      title: tr("apiClients.webhookRotate"),
      children: <Text size="sm">{tr("apiClients.webhookRotateConfirm")}</Text>,
      labels: {
        confirm: tr("apiClients.webhookRotate"),
        cancel: tr("common.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: () =>
        start(async () => {
          const r = await rotateWebhookSecretAction(w.id);
          if (!r.ok) return fail(r.error);
          setIssued({ name: w.name, secret: r.data.secret });
        }),
    });
  }

  function remove(w: WebhookView) {
    modals.openConfirmModal({
      title: tr("common.delete"),
      children: <Text size="sm">{tr("apiClients.webhookDeleteConfirm")}</Text>,
      labels: { confirm: tr("common.delete"), cancel: tr("common.cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => run(() => deleteWebhookAction(w.id)),
    });
  }

  function test(w: WebhookView) {
    start(async () => {
      const r = await testWebhookAction(w.id);
      if (!r.ok) return fail(r.error);
      if (r.data.delivered) {
        notifications.show({
          color: "green",
          message: tr("apiClients.webhookTestOk", {
            status: r.data.status ?? 0,
          }),
        });
      } else {
        fail(
          tr("apiClients.webhookTestFailed", {
            error: r.data.error ?? String(r.data.status ?? ""),
          }),
        );
      }
    });
  }

  function openHistory(w: WebhookView) {
    start(async () => {
      const r = await listWebhookDeliveriesAction(w.id);
      if (!r.ok) return fail(r.error);
      setHistory({ id: w.id, name: w.name, rows: r.data.rows });
    });
  }

  function redeliver(deliveryId: string) {
    start(async () => {
      const r = await redeliverWebhookAction(deliveryId);
      if (!r.ok) return fail(r.error);
      if (history) {
        const again = await listWebhookDeliveriesAction(history.id);
        if (again.ok) setHistory({ ...history, rows: again.data.rows });
      }
    });
  }

  const byResource = new Map<string, EventTypeOption[]>();
  for (const e of eventTypes) {
    byResource.set(e.resource, [...(byResource.get(e.resource) ?? []), e]);
  }
  const allSelected = selected.has("*");

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Stack gap={2}>
          <Text fw={600} size="sm">
            {tr("apiClients.webhooksTitle")}
          </Text>
          <Text c="dimmed" size="sm">
            {tr("apiClients.webhooksIntro")}
          </Text>
        </Stack>
        <Button
          disabled={!canManage || clients.length === 0 || encryptionKeyMissing}
          leftSection={<IconPlus size={14} />}
          onClick={() => setCreating(true)}
        >
          {tr("common.new")}
        </Button>
      </Group>

      {encryptionKeyMissing && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
          {tr("apiClients.webhookNoKey", { env: "SETTINGS_ENCRYPTION_KEY" })}
        </Alert>
      )}

      <Table highlightOnHover striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{tr("common.name")}</Table.Th>
            <Table.Th>{tr("apiClients.webhookUrl")}</Table.Th>
            <Table.Th>{tr("apiClients.webhookEvents")}</Table.Th>
            <Table.Th>{tr("common.status")}</Table.Th>
            <Table.Th>{tr("apiClients.webhookLastDelivered")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {webhooks.map((w) => (
            <Table.Tr key={w.id}>
              <Table.Td>
                <Stack gap={2}>
                  <Text fw={600} size="sm">
                    {w.name}
                  </Text>
                  <Text c="dimmed" size="xs">
                    {w.clientName}
                  </Text>
                </Stack>
              </Table.Td>
              <Table.Td>
                <Text ff="mono" size="xs">
                  {maskUrl(w.url)}
                </Text>
                {w.secretLast4 && (
                  <Text c="dimmed" ff="mono" size="xs">
                    {`whsec_••••${w.secretLast4}`}
                  </Text>
                )}
              </Table.Td>
              <Table.Td>
                <Tooltip label={w.eventTypes.join(", ")} multiline w={320}>
                  <Badge size="sm" variant="outline">
                    {w.eventTypes.includes("*")
                      ? tr("apiClients.webhookAllEvents")
                      : tr("apiClients.webhookEventCount", {
                          count: w.eventTypes.length,
                        })}
                  </Badge>
                </Tooltip>
              </Table.Td>
              <Table.Td>
                <Stack gap={4}>
                  {w.isActive ? (
                    <Badge color="green" variant="light">
                      {tr("common.enabled")}
                    </Badge>
                  ) : (
                    <Tooltip
                      disabled={!w.disabledReason}
                      label={w.disabledReason}
                      multiline
                      w={280}
                    >
                      <Badge color="gray" variant="light">
                        {tr("common.disabled")}
                      </Badge>
                    </Tooltip>
                  )}
                  {w.pendingCount > 0 && (
                    <Badge color="blue" size="xs" variant="light">
                      {tr("apiClients.webhookPending", {
                        count: w.pendingCount,
                      })}
                    </Badge>
                  )}
                  {w.failedCount > 0 && (
                    <Badge color="red" size="xs" variant="light">
                      {tr("apiClients.webhookFailed", { count: w.failedCount })}
                    </Badge>
                  )}
                </Stack>
              </Table.Td>
              <Table.Td>
                <Text c="dimmed" size="xs">
                  {w.lastDeliveredAt
                    ? fmt.dateTime(new Date(w.lastDeliveredAt))
                    : tr("apiClients.neverUsed")}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Button
                    disabled={pending}
                    onClick={() => test(w)}
                    size="xs"
                    variant="default"
                  >
                    {tr("apiClients.webhookTest")}
                  </Button>
                  <Button
                    disabled={pending}
                    onClick={() => openHistory(w)}
                    size="xs"
                    variant="default"
                  >
                    {tr("apiClients.webhookDeliveries")}
                  </Button>
                  <Button
                    disabled={pending || !canManage}
                    onClick={() => rotate(w)}
                    size="xs"
                    variant="default"
                  >
                    {tr("apiClients.webhookRotate")}
                  </Button>
                  <Button
                    disabled={pending || (!w.isActive && !canManage)}
                    onClick={() =>
                      run(() => setWebhookActiveAction(w.id, !w.isActive))
                    }
                    size="xs"
                    variant="default"
                  >
                    {w.isActive ? tr("common.disable") : tr("common.enable")}
                  </Button>
                  <Button
                    color="red"
                    disabled={pending}
                    onClick={() => remove(w)}
                    size="xs"
                    variant="subtle"
                  >
                    {tr("common.delete")}
                  </Button>
                </Group>
              </Table.Td>
            </Table.Tr>
          ))}
          {webhooks.length === 0 && (
            <Table.Tr>
              <Table.Td colSpan={6}>
                <Text c="dimmed" py="md" size="sm" ta="center">
                  {tr("apiClients.webhookEmpty")}
                </Text>
              </Table.Td>
            </Table.Tr>
          )}
        </Table.Tbody>
      </Table>

      <Modal
        onClose={() => setCreating(false)}
        opened={creating}
        size="lg"
        title={tr("apiClients.webhookCreateTitle")}
      >
        <Stack gap="sm">
          <TextInput
            label={tr("common.name")}
            onChange={(e) => setName(e.currentTarget.value)}
            value={name}
            withAsterisk
          />
          <Select
            data={clients.map((c) => ({ value: c.id, label: c.name }))}
            description={tr("apiClients.webhookClientHelp")}
            label={tr("apiClients.webhookClient")}
            onChange={setClientId}
            value={clientId}
            withAsterisk
          />
          <TextInput
            description={tr("apiClients.webhookUrlHelp")}
            label={tr("apiClients.webhookUrl")}
            onChange={(e) => setUrl(e.currentTarget.value)}
            placeholder="http://n8n:5678/webhook/…"
            value={url}
            withAsterisk
          />
          <Stack gap={6}>
            <Text fw={500} size="sm">
              {tr("apiClients.webhookEvents")}
            </Text>
            <Checkbox
              checked={allSelected}
              label={tr("apiClients.webhookAllEvents")}
              onChange={(e) =>
                setSelected(
                  e.currentTarget.checked ? new Set(["*"]) : new Set(),
                )
              }
            />
            {!allSelected &&
              [...byResource.entries()].map(([resource, list]) => (
                <Stack gap={2} key={resource}>
                  <Text c="dimmed" size="xs">
                    {list[0]?.summary}
                  </Text>
                  <Group gap="md">
                    {list.map((e) => (
                      <Checkbox
                        checked={selected.has(e.type)}
                        key={e.type}
                        label={<Code>{e.type.slice(resource.length + 1)}</Code>}
                        onChange={(ev) =>
                          toggleType(e.type, ev.currentTarget.checked)
                        }
                        size="xs"
                      />
                    ))}
                  </Group>
                </Stack>
              ))}
          </Stack>
          <Alert color="blue" variant="light">
            {tr("apiClients.webhookCreateHint")}
          </Alert>
          <Group justify="flex-end">
            <Button onClick={() => setCreating(false)} variant="default">
              {tr("common.cancel")}
            </Button>
            <Button
              disabled={
                !name.trim() || !url.trim() || !clientId || selected.size === 0
              }
              loading={pending}
              onClick={create}
            >
              {tr("common.save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        onClose={() => setIssued(null)}
        opened={issued !== null}
        title={tr("apiClients.webhookSecretTitle")}
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
          <Code block>{issued?.secret}</Code>
          <Group justify="flex-end">
            <Button onClick={() => setIssued(null)}>
              {tr("common.close")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Drawer
        onClose={() => setHistory(null)}
        opened={history !== null}
        position="right"
        size="xl"
        title={`${tr("apiClients.webhookDeliveries")} — ${history?.name ?? ""}`}
      >
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{tr("apiClients.webhookEvent")}</Table.Th>
              <Table.Th>{tr("common.status")}</Table.Th>
              <Table.Th>{tr("apiClients.webhookAttempts")}</Table.Th>
              <Table.Th>{tr("apiClients.webhookResult")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {history?.rows.map((d) => (
              <Table.Tr key={d.id}>
                <Table.Td>
                  <Stack gap={2}>
                    <Code>{d.eventType}</Code>
                    <Text c="dimmed" size="xs">
                      {fmt.dateTime(new Date(d.createdAt))}
                    </Text>
                  </Stack>
                </Table.Td>
                <Table.Td>
                  <Badge
                    color={
                      d.status === "SUCCEEDED"
                        ? "green"
                        : d.status === "FAILED"
                          ? "red"
                          : "blue"
                    }
                    variant="light"
                  >
                    {d.status}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{d.attempts}</Text>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="xs">
                    {d.lastStatus ?? ""} {d.lastError ?? ""}
                  </Text>
                  {d.status === "PENDING" && d.attempts > 0 && (
                    <Text c="dimmed" size="xs">
                      {tr("apiClients.webhookNextAttempt", {
                        at: fmt.dateTime(new Date(d.nextAttemptAt)),
                      })}
                    </Text>
                  )}
                </Table.Td>
                <Table.Td>
                  {d.status === "FAILED" && (
                    <Button
                      disabled={pending}
                      onClick={() => redeliver(d.id)}
                      size="xs"
                      variant="default"
                    >
                      {tr("apiClients.webhookRedeliver")}
                    </Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
            {history && history.rows.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={5}>
                  <Text c="dimmed" py="md" size="sm" ta="center">
                    {tr("apiClients.webhookDeliveriesEmpty")}
                  </Text>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Drawer>
    </Stack>
  );
}
