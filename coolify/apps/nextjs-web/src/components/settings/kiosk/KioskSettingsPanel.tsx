"use client";

/**
 * KioskSettingsPanel — 共有端末設定（SY0A）のクライアント本体。
 *
 * v1: キオスクランチャーに載せるアプリの表示 on/off（`kiosk.apps`）を Switch で
 * 編集し、まとめて保存する。加えて現在の認証ポリシー（セッション/PIN/端末
 * トークンの時間）を参照表示する（この版では固定・編集は後続）。
 */

import {
  Alert,
  Badge,
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { updateKioskAppFlags } from "@/app/(dashboard)/settings/kiosk/actions";
import { EditablePanel } from "@/components/ui/EditablePanel";
import { FormActions } from "@/components/ui/shells";
import type { KioskAppCatalogEntry } from "@/lib/kiosk-settings";

type PolicyRow = { label: string; value: string };

/** アプリ表示 on/off の編集フォーム（EditablePanel の edit）。 */
function KioskAppFlagsEditor({
  catalog,
  initialFlags,
  onCancel,
  onSaved,
}: {
  catalog: KioskAppCatalogEntry[];
  initialFlags: Record<string, boolean>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tr = useTranslations();
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [isPending, startTransition] = useTransition();

  const dirty = catalog.some((a) => flags[a.key] !== initialFlags[a.key]);

  const save = () => {
    startTransition(async () => {
      const result = await updateKioskAppFlags(flags);
      if (result.ok) {
        notifications.show({
          title: tr("common.saved2"),
          message: tr("settings.kiosk.theSharedDeviceAppDisplaySettings"),
          color: "green",
        });
        onSaved();
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: result.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="sm">
      <Stack gap="xs">
        {catalog.map((app) => (
          <Group justify="space-between" key={app.key} wrap="nowrap">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text fw={500}>{app.label}</Text>
              <Text c="dimmed" size="xs">
                {tr("settings.kioskSettingsPanel.permissionCode", {
                  code: app.permission,
                })}
              </Text>
            </Stack>
            <Switch
              aria-label={tr("settings.kioskSettingsPanel.showLabel", {
                label: app.label,
              })}
              checked={flags[app.key] ?? true}
              onChange={(e) =>
                setFlags((prev) => ({
                  ...prev,
                  [app.key]: e.currentTarget.checked,
                }))
              }
            />
          </Group>
        ))}
      </Stack>
      <FormActions
        disabled={!dirty}
        loading={isPending}
        onCancel={onCancel}
        onSave={save}
      />
    </Stack>
  );
}

/** アプリ表示 on/off の閲覧表示（EditablePanel の view）。 */
function KioskAppFlagsView({
  catalog,
  flags,
}: {
  catalog: KioskAppCatalogEntry[];
  flags: Record<string, boolean>;
}) {
  const tr = useTranslations();
  return (
    <Stack gap="xs">
      {catalog.map((app) => (
        <Group justify="space-between" key={app.key} wrap="nowrap">
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={500}>{app.label}</Text>
            <Text c="dimmed" size="xs">
              {tr("settings.kioskSettingsPanel.permissionCode", {
                code: app.permission,
              })}
            </Text>
          </Stack>
          <Badge
            color={(flags[app.key] ?? true) ? "green" : "gray"}
            variant="light"
          >
            {(flags[app.key] ?? true)
              ? tr("common.display")
              : tr("admin.appFlagsTable.hidden")}
          </Badge>
        </Group>
      ))}
    </Stack>
  );
}

export function KioskSettingsPanel({
  catalog,
  initialFlags,
  policy,
}: {
  catalog: KioskAppCatalogEntry[];
  initialFlags: Record<string, boolean>;
  policy: PolicyRow[];
}) {
  const tr = useTranslations();

  return (
    <Stack gap="lg">
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Title order={4}>{tr("settings.kiosk.appsShownInTheLauncher")}</Title>
          <Text c="dimmed" size="sm">
            {tr("settings.kiosk.chooseWhichAppsAppearInThe")}
          </Text>
          <EditablePanel
            canEdit
            edit={({ close }) => (
              <KioskAppFlagsEditor
                catalog={catalog}
                initialFlags={initialFlags}
                onCancel={close}
                onSaved={close}
              />
            )}
            view={<KioskAppFlagsView catalog={catalog} flags={initialFlags} />}
          />
        </Stack>
      </Paper>

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Group gap="xs">
            <Title order={4}>{tr("settings.kiosk.authenticationPolicy")}</Title>
            <Badge color="gray" variant="light">
              {tr("settings.kiosk.readOnly")}
            </Badge>
          </Group>
          <Alert color="gray" icon={<IconInfoCircle size={18} />}>
            {tr("settings.kiosk.theCurrentValueIsFixedIn")}
          </Alert>
          <Table.ScrollContainer minWidth={420}>
            <Table striped withTableBorder>
              <Table.Tbody>
                {policy.map((row) => (
                  <Table.Tr key={row.label}>
                    <Table.Td>{row.label}</Table.Td>
                    <Table.Td style={{ textAlign: "right" }}>
                      {row.value}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Stack>
      </Paper>
    </Stack>
  );
}
