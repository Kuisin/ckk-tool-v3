"use client";

/**
 * LookupTablesForm — 試算計算（SY02）のルックアップ表エディタ。
 *
 * 管理者が「表名 + キー/値」の表を定義し、計算基準の式内で lookup("表名", キー)
 * として参照する。保存は updateLookupTables。
 */

import {
  ActionIcon,
  Code,
  Divider,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateLookupTables } from "@/app/(dashboard)/settings/actions";
import { CancelButton, GhostButton, SaveButton } from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import type { LookupEntry, LookupTable } from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine";

export function LookupTablesForm({ initial }: { initial: LookupTable[] }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [tables, setTables] = useState<LookupTable[]>(initial);
  const [isPending, startTransition] = useTransition();

  const patchTable = (ti: number, p: Partial<LookupTable>) =>
    setTables((ts) => ts.map((t, i) => (i === ti ? { ...t, ...p } : t)));

  const setEntries = (ti: number, entries: LookupEntry[]) =>
    patchTable(ti, { entries });

  const addTable = () =>
    setTables((ts) => [
      ...ts,
      { id: crypto.randomUUID(), name: "", description: "", entries: [] },
    ]);

  const save = () => {
    startTransition(async () => {
      const res = await updateLookupTables(tables);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: "ルックアップ表を更新しました",
          color: "green",
        });
        router.push(BASE);
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={[
          "システム",
          { label: "試算計算", href: BASE },
          "ルックアップ表",
        ]}
        title="ルックアップ表"
      />
      <Text c="dimmed" size="sm">
        計算基準の式内で <Code>lookup("表名", キー)</Code>{" "}
        として参照します（該当なしは 0）。キーは文字列として照合します。
      </Text>

      <FormSection title="表一覧">
        <Stack gap="md">
          {tables.length === 0 && (
            <Text c="dimmed" size="sm">
              表がありません。「表を追加」から作成してください。
            </Text>
          )}
          {tables.map((t, ti) => (
            <Paper key={t.id} p="md" radius="md" withBorder>
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <TextInput
                  description='式内での参照名（例: coatRate → lookup("coatRate", ...)）'
                  label="表名"
                  onChange={(e) =>
                    patchTable(ti, { name: e.currentTarget.value })
                  }
                  placeholder="coatRate"
                  style={{ flex: 1 }}
                  value={t.name}
                  withAsterisk
                />
                <TextInput
                  label="説明"
                  onChange={(e) =>
                    patchTable(ti, { description: e.currentTarget.value })
                  }
                  placeholder="任意"
                  style={{ flex: 1 }}
                  value={t.description ?? ""}
                />
                <ActionIcon
                  aria-label="表を削除"
                  color="red"
                  onClick={() =>
                    setTables((ts) => ts.filter((_, i) => i !== ti))
                  }
                  variant="default"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>

              <Divider label="キー / 値" labelPosition="left" my="sm" />
              <Stack gap="xs">
                {t.entries.map((e, ei) => (
                  <Group
                    gap="xs"
                    // biome-ignore lint/suspicious/noArrayIndexKey: entry rows have no stable id
                    key={ei}
                    wrap="nowrap"
                  >
                    <TextInput
                      onChange={(ev) =>
                        setEntries(
                          ti,
                          t.entries.map((x, j) =>
                            j === ei
                              ? { ...x, key: ev.currentTarget.value }
                              : x,
                          ),
                        )
                      }
                      placeholder="キー"
                      style={{ flex: 1 }}
                      value={e.key}
                    />
                    <NumberInput
                      onChange={(v) =>
                        setEntries(
                          ti,
                          t.entries.map((x, j) =>
                            j === ei
                              ? { ...x, value: typeof v === "number" ? v : 0 }
                              : x,
                          ),
                        )
                      }
                      placeholder="値"
                      style={{ flex: 1 }}
                      value={e.value}
                    />
                    <ActionIcon
                      aria-label="行を削除"
                      color="red"
                      onClick={() =>
                        setEntries(
                          ti,
                          t.entries.filter((_, j) => j !== ei),
                        )
                      }
                      variant="default"
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                ))}
                <GhostButton
                  leftSection={<IconPlus size={12} />}
                  onClick={() =>
                    setEntries(ti, [...t.entries, { key: "", value: 0 }])
                  }
                  size="compact-xs"
                >
                  行を追加
                </GhostButton>
              </Stack>
            </Paper>
          ))}
          <GhostButton leftSection={<IconPlus size={16} />} onClick={addTable}>
            表を追加
          </GhostButton>
        </Stack>
      </FormSection>

      <Group justify={isMobile ? "stretch" : "flex-end"}>
        <CancelButton fullWidth={isMobile} onClick={() => router.push(BASE)} />
        <SaveButton fullWidth={isMobile} loading={isPending} onClick={save}>
          保存
        </SaveButton>
      </Group>
    </Stack>
  );
}
