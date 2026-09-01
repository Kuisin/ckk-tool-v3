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
import { useState, useTransition } from "react";
import { updateKioskAppFlags } from "@/app/(dashboard)/settings/kiosk/actions";
import { FormActions } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import type { KioskAppCatalogEntry } from "@/lib/kiosk-settings";

type PolicyRow = { label: string; value: string };

export function KioskSettingsPanel({
  catalog,
  initialFlags,
  policy,
}: {
  catalog: KioskAppCatalogEntry[];
  initialFlags: Record<string, boolean>;
  policy: PolicyRow[];
}) {
  const tr = useTr();
  const [flags, setFlags] = useState<Record<string, boolean>>(initialFlags);
  const [isPending, startTransition] = useTransition();

  const dirty = catalog.some((a) => flags[a.key] !== initialFlags[a.key]);

  const save = () => {
    startTransition(async () => {
      const result = await updateKioskAppFlags(flags);
      if (result.ok) {
        notifications.show({
          title: tr("保存しました"),
          message: tr("共有端末のアプリ表示設定を更新しました"),
          color: "green",
        });
      } else {
        notifications.show({
          title: tr("エラー"),
          message: tr(result.error),
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="lg">
      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Title order={4}>{tr("ランチャーに表示するアプリ")}</Title>
          <Text c="dimmed" size="sm">
            {tr(
              tr(
                tr(
                  "共有端末（キオスク）のランチャーに載せるアプリを選びます。無効にすると、\n            権限を持つ利用者にも表示されません。",
                ),
              ),
            )}
          </Text>
          <Stack gap="xs" mt="xs">
            {catalog.map((app) => (
              <Group justify="space-between" key={app.key} wrap="nowrap">
                <Stack gap={0} style={{ minWidth: 0 }}>
                  <Text fw={500}>{app.label}</Text>
                  <Text c="dimmed" size="xs">
                    権限コード: {app.permission}
                  </Text>
                </Stack>
                <Switch
                  aria-label={`${app.label} を表示`}
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
        </Stack>
      </Paper>

      <Paper p="md" radius="md" shadow="xs">
        <Stack gap="sm">
          <Group gap="xs">
            <Title order={4}>{tr("認証ポリシー")}</Title>
            <Badge color="gray" variant="light">
              {tr("参照のみ")}
            </Badge>
          </Group>
          <Alert color="gray" icon={<IconInfoCircle size={18} />}>
            {tr(
              tr(
                tr(
                  "現在の値は端末アプリ側で固定です。編集可能化は次回対応予定です。",
                ),
              ),
            )}
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

      {/* 保存は画面下端に固定（design.md §8.3）。 */}
      <FormActions disabled={!dirty} loading={isPending} onSave={save} />
    </Stack>
  );
}
