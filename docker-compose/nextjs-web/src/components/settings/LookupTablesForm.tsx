"use client";

/**
 * LookupTablesForm — 試算計算（SY02）のルックアップ表エディタ（多列キー）。
 *
 * 管理者が「キー列（複数）+ 戻り値」の表を定義し、式内で
 * lookup("表名", key1, key2, ...) で参照する。キー列の組み合わせは一意。戻り値は
 * 数値 or 文字列。CSV（Excel 互換）のインポート・テンプレート出力に対応。
 */

import {
  ActionIcon,
  Code,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconDownload,
  IconPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { updateLookupTables } from "@/app/(dashboard)/settings/actions";
import {
  CancelButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormSection } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import type {
  LookupRow,
  LookupTable,
  LookupValueType,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine";

const VALUE_TYPE_OPTIONS: { value: LookupValueType; label: string }[] = [
  { value: "number", label: "数値" },
  { value: "string", label: "文字列" },
];

const safeName = (n: string) =>
  (n.trim() ? n.trim() : "table").replace(/[^A-Za-z0-9_-]+/g, "_");

export function LookupTablesForm({ initial }: { initial: LookupTable[] }) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [tables, setTables] = useState<LookupTable[]>(
    initial.map((t) => ({
      ...t,
      keyColumns: t.keyColumns.length ? t.keyColumns : ["key"],
    })),
  );
  const [isPending, startTransition] = useTransition();
  // インポート対象テーブル index を保持するための隠しファイル入力。
  const fileRef = useRef<HTMLInputElement>(null);
  const importTargetRef = useRef<number | null>(null);

  const patchTable = (ti: number, p: Partial<LookupTable>) =>
    setTables((ts) => ts.map((t, i) => (i === ti ? { ...t, ...p } : t)));

  const setRows = (ti: number, rows: LookupRow[]) => patchTable(ti, { rows });

  const addTable = () =>
    setTables((ts) => [
      ...ts,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        keyColumns: ["key"],
        valueType: "number",
        rows: [],
      },
    ]);

  // ── キー列の追加・削除・改名（行のキー配列も同期）───────────────────────────
  const addColumn = (ti: number) => {
    const t = tables[ti];
    patchTable(ti, {
      keyColumns: [...t.keyColumns, `key${t.keyColumns.length + 1}`],
      rows: t.rows.map((r) => ({ ...r, keys: [...r.keys, ""] })),
    });
  };
  const removeColumn = (ti: number, ci: number) => {
    const t = tables[ti];
    if (t.keyColumns.length <= 1) return;
    patchTable(ti, {
      keyColumns: t.keyColumns.filter((_, i) => i !== ci),
      rows: t.rows.map((r) => ({
        ...r,
        keys: r.keys.filter((_, i) => i !== ci),
      })),
    });
  };
  const renameColumn = (ti: number, ci: number, name: string) => {
    const t = tables[ti];
    patchTable(ti, {
      keyColumns: t.keyColumns.map((c, i) => (i === ci ? name : c)),
    });
  };

  const addRow = (ti: number) => {
    const t = tables[ti];
    setRows(ti, [...t.rows, { keys: t.keyColumns.map(() => ""), value: "" }]);
  };

  // ── CSV: テンプレート/エクスポート ─────────────────────────────────────────
  const downloadTemplate = (ti: number) => {
    const t = tables[ti];
    const header = [...t.keyColumns, "値"];
    const body = t.rows.length
      ? t.rows.map((r) => [...r.keys, r.value])
      : [t.keyColumns.map(() => ""), t.keyColumns.map(() => "")].map((k) => [
          ...k,
          "",
        ]);
    downloadCsv(`lookup_${safeName(t.name)}.csv`, toCsv([header, ...body]));
  };

  // ── CSV: インポート ────────────────────────────────────────────────────────
  const triggerImport = (ti: number) => {
    importTargetRef.current = ti;
    fileRef.current?.click();
  };
  const onFile = async (file: File) => {
    const ti = importTargetRef.current;
    if (ti == null) return;
    const rows = parseCsv(await file.text());
    if (rows.length < 1) {
      notifications.show({
        title: "エラー",
        message: "CSV が空です",
        color: "red",
      });
      return;
    }
    const header = rows[0];
    if (header.length < 2) {
      notifications.show({
        title: "エラー",
        message: "列が不足しています（キー列 + 値）",
        color: "red",
      });
      return;
    }
    const keyColumns = header.slice(0, -1).map((h) => h.trim() || "key");
    const dataRows: LookupRow[] = rows.slice(1).map((r) => ({
      keys: keyColumns.map((_, i) => (r[i] ?? "").trim()),
      value: (r[keyColumns.length] ?? "").trim(),
    }));
    patchTable(ti, { keyColumns, rows: dataRows });
    notifications.show({
      title: "取り込みました",
      message: `${dataRows.length} 行を読み込みました（保存で確定）`,
      color: "green",
    });
    if (fileRef.current) fileRef.current.value = "";
  };

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
        キー列の組み合わせ（一意）から戻り値を引く表です。式内では{" "}
        <Code>lookup("表名", キー1, キー2, ...)</Code>{" "}
        で参照します（キー列の順に指定・該当なしは数値0/文字列空）。CSV （Excel
        互換）で取込・テンプレート出力できます。
      </Text>

      <input
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
        }}
        ref={fileRef}
        style={{ display: "none" }}
        type="file"
      />

      <FormSection title="表一覧">
        <Stack gap="lg">
          {tables.length === 0 && (
            <Text c="dimmed" size="sm">
              表がありません。「表を追加」から作成してください。
            </Text>
          )}
          {tables.map((t, ti) => (
            <Paper key={t.id} p="md" radius="md" withBorder>
              <Group align="flex-end" gap="sm" wrap="nowrap">
                <TextInput
                  description="式内での参照名"
                  label="表名"
                  onChange={(e) =>
                    patchTable(ti, { name: e.currentTarget.value })
                  }
                  placeholder="coatRate"
                  style={{ flex: 1 }}
                  value={t.name}
                  withAsterisk
                />
                <Select
                  data={VALUE_TYPE_OPTIONS}
                  label="戻り値の型"
                  onChange={(v) =>
                    patchTable(ti, {
                      valueType: (v as LookupValueType) ?? "number",
                    })
                  }
                  value={t.valueType}
                  w={110}
                />
                <ActionIcon
                  aria-label="表を削除"
                  color="red"
                  mb={4}
                  onClick={() =>
                    setTables((ts) => ts.filter((_, i) => i !== ti))
                  }
                  variant="default"
                >
                  <IconTrash size={16} />
                </ActionIcon>
              </Group>
              <Textarea
                autosize
                label="説明"
                maxRows={2}
                minRows={1}
                mt="xs"
                onChange={(e) =>
                  patchTable(ti, { description: e.currentTarget.value })
                }
                placeholder="任意"
                value={t.description ?? ""}
              />

              <Group gap="xs" mt="sm">
                <SecondaryButton
                  leftSection={<IconDownload size={14} />}
                  onClick={() => downloadTemplate(ti)}
                >
                  テンプレート/CSV
                </SecondaryButton>
                <SecondaryButton
                  leftSection={<IconUpload size={14} />}
                  onClick={() => triggerImport(ti)}
                >
                  CSV 取込
                </SecondaryButton>
                <GhostButton
                  leftSection={<IconPlus size={14} />}
                  onClick={() => addColumn(ti)}
                >
                  キー列を追加
                </GhostButton>
              </Group>

              <Divider label="データ" labelPosition="left" my="sm" />
              <ScrollArea>
                <Table withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      {t.keyColumns.map((c, ci) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: column has no stable id
                        <Table.Th key={ci} style={{ minWidth: 120 }}>
                          <Group gap={4} wrap="nowrap">
                            <TextInput
                              onChange={(e) =>
                                renameColumn(ti, ci, e.currentTarget.value)
                              }
                              placeholder={`キー列${ci + 1}`}
                              size="xs"
                              value={c}
                              variant="unstyled"
                            />
                            <ActionIcon
                              aria-label="キー列を削除"
                              color="red"
                              disabled={t.keyColumns.length <= 1}
                              onClick={() => removeColumn(ti, ci)}
                              size="sm"
                              variant="subtle"
                            >
                              <IconTrash size={12} />
                            </ActionIcon>
                          </Group>
                        </Table.Th>
                      ))}
                      <Table.Th style={{ minWidth: 120 }}>値</Table.Th>
                      <Table.Th style={{ width: 40 }} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {t.rows.map((r, ri) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: row has no stable id
                      <Table.Tr key={ri}>
                        {t.keyColumns.map((_, ci) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: cell has no stable id
                          <Table.Td key={ci}>
                            <TextInput
                              onChange={(e) =>
                                setRows(
                                  ti,
                                  t.rows.map((x, j) =>
                                    j === ri
                                      ? {
                                          ...x,
                                          keys: x.keys.map((k, m) =>
                                            m === ci
                                              ? e.currentTarget.value
                                              : k,
                                          ),
                                        }
                                      : x,
                                  ),
                                )
                              }
                              size="xs"
                              value={r.keys[ci] ?? ""}
                            />
                          </Table.Td>
                        ))}
                        <Table.Td>
                          <TextInput
                            onChange={(e) =>
                              setRows(
                                ti,
                                t.rows.map((x, j) =>
                                  j === ri
                                    ? { ...x, value: e.currentTarget.value }
                                    : x,
                                ),
                              )
                            }
                            placeholder={
                              t.valueType === "number" ? "数値" : "文字列"
                            }
                            size="xs"
                            value={r.value}
                          />
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            aria-label="行を削除"
                            color="red"
                            onClick={() =>
                              setRows(
                                ti,
                                t.rows.filter((_, j) => j !== ri),
                              )
                            }
                            variant="subtle"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              <GhostButton
                leftSection={<IconPlus size={12} />}
                mt="xs"
                onClick={() => addRow(ti)}
                size="compact-xs"
              >
                行を追加
              </GhostButton>
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
