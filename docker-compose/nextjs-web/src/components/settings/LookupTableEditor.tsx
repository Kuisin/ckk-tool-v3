"use client";

/**
 * LookupTableEditor — 1 つのルックアップ表を専用ページで編集する（編集モード）。
 *
 * 表名・戻り値型・既定値（一致なし時）・キー列（照合方法 exact/ge/le 付き）・行を
 * 編集し、id で upsert 保存する。一覧ページ（LookupTablesList）から別ウィンドウで開く。
 * CSV（Excel 互換）で行を取込・出力できる。
 */

import {
  ActionIcon,
  Badge,
  Code,
  Group,
  Select,
  Stack,
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
import { type ChangeEvent, useRef, useState, useTransition } from "react";
import {
  deleteLookupTable,
  upsertLookupTable,
} from "@/app/(dashboard)/settings/actions";
import {
  CancelButton,
  DeleteButton,
  GhostButton,
  SaveButton,
  SecondaryButton,
} from "@/components/ui/buttons";
import { EditableCellTable } from "@/components/ui/EditableCellTable";
import { openConfirm } from "@/components/ui/modals";
import { FormSection, LocalizedTextInput } from "@/components/ui/shells";
import { useIsMobile } from "@/hooks/useViewport";
import { downloadCsv, parseCsv, toCsv } from "@/lib/csv";
import { localized } from "@/lib/format";
import type {
  LookupKeyMatch,
  LookupRow,
  LookupTable,
  LookupValueType,
} from "@/lib/trial-pricing-criteria";

const BASE = "/settings/trial-pricing-engine";
const LIST = `${BASE}/lookups`;

const VALUE_TYPE_OPTIONS: { value: LookupValueType; label: string }[] = [
  { value: "number", label: "数値" },
  { value: "string", label: "文字列" },
];

const MATCH_OPTIONS: { value: LookupKeyMatch; label: string }[] = [
  { value: "exact", label: "完全一致" },
  { value: "ge", label: "≥ 以上で最小（径×長）" },
  { value: "le", label: "≤ 以下で最大（LD/割引）" },
];

const safeName = (n: string) =>
  (n.trim() ? n.trim() : "table").replace(/[^A-Za-z0-9_-]+/g, "_");

/** keyMatch を keyColumns と同じ長さに正規化（不足は exact）。 */
function normalizeMatch(t: LookupTable): LookupKeyMatch[] {
  return t.keyColumns.map((_, i) => t.keyMatch?.[i] ?? "exact");
}

export function LookupTableEditor({
  initial,
  isNew,
}: {
  initial: LookupTable;
  isNew: boolean;
}) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const [table, setTable] = useState<LookupTable>({
    ...initial,
    keyColumns: initial.keyColumns.length ? initial.keyColumns : ["key"],
    keyMatch: normalizeMatch({
      ...initial,
      keyColumns: initial.keyColumns.length ? initial.keyColumns : ["key"],
    }),
  });
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<LookupTable>) => setTable((t) => ({ ...t, ...p }));
  const setRows = (rows: LookupRow[]) => patch({ rows });
  const setName = (lang: "ja" | "en", v: string) =>
    setTable((t) => ({ ...t, name: { ...t.name, [lang]: v } }));

  // ── キー列（照合方法つき）───────────────────────────────────────────────────
  const addColumn = () =>
    patch({
      keyColumns: [...table.keyColumns, `key${table.keyColumns.length + 1}`],
      keyMatch: [...(table.keyMatch ?? []), "exact"],
      rows: table.rows.map((r) => ({ ...r, keys: [...r.keys, ""] })),
    });
  const removeColumn = (ci: number) => {
    if (table.keyColumns.length <= 1) return;
    patch({
      keyColumns: table.keyColumns.filter((_, i) => i !== ci),
      keyMatch: (table.keyMatch ?? []).filter((_, i) => i !== ci),
      rows: table.rows.map((r) => ({
        ...r,
        keys: r.keys.filter((_, i) => i !== ci),
      })),
    });
  };
  const renameColumn = (ci: number, name: string) =>
    patch({
      keyColumns: table.keyColumns.map((c, i) => (i === ci ? name : c)),
    });
  const setColumnMatch = (ci: number, mode: LookupKeyMatch) =>
    patch({
      keyMatch: normalizeMatch(table).map((m, i) => (i === ci ? mode : m)),
    });

  const addRow = () =>
    setRows([
      ...table.rows,
      { keys: table.keyColumns.map(() => ""), value: "" },
    ]);

  // ── CSV ─────────────────────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const header = [...table.keyColumns, "値"];
    const body = table.rows.length
      ? table.rows.map((r) => [...r.keys, r.value])
      : [table.keyColumns.map(() => "")].map((k) => [...k, ""]);
    downloadCsv(`lookup_${safeName(table.id)}.csv`, toCsv([header, ...body]));
  };
  const onFile = async (file: File) => {
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
    setTable((t) => ({
      ...t,
      keyColumns,
      keyMatch: keyColumns.map((_, i) => t.keyMatch?.[i] ?? "exact"),
      rows: dataRows,
    }));
    notifications.show({
      title: "取り込みました",
      message: `${dataRows.length} 行を読み込みました（保存で確定）`,
      color: "green",
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── 保存 / 削除 ──────────────────────────────────────────────────────────────
  const save = () => {
    startTransition(async () => {
      const res = await upsertLookupTable(table);
      if (res.ok) {
        notifications.show({
          title: "保存しました",
          message: `「${localized(table.name)}」を更新しました`,
          color: "green",
        });
        router.push(LIST);
      } else {
        notifications.show({
          title: "エラー",
          message: res.error,
          color: "red",
        });
      }
    });
  };
  const remove = () =>
    openConfirm({
      title: "表の削除",
      message: `「${localized(table.name)}」を削除します。この操作は取り消せません。`,
      confirmLabel: "削除",
      onConfirm: () =>
        startTransition(async () => {
          const res = await deleteLookupTable(table.id);
          if (res.ok) {
            notifications.show({
              title: "削除しました",
              message: `「${localized(table.name)}」を削除しました`,
              color: "green",
            });
            router.push(LIST);
          } else {
            notifications.show({
              title: "エラー",
              message: res.error,
              color: "red",
            });
          }
        }),
    });

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        {isNew ? "新規ルックアップ表。" : ""}式内では{" "}
        <Code>lookup("{table.id || "id"}", キー1, ...)</Code>{" "}
        で参照します。照合方法（完全一致 / ≥ / ≤）で Excel の MATCH/VLOOKUP
        近似照合を再現します。一致なしは「既定値」を返します。
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

      <FormSection title="表の設定">
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              description={
                isNew
                  ? '式内 lookup("ID") の参照キー。作成後は変更できません'
                  : "参照キー（作成後は変更不可）"
              }
              disabled={!isNew}
              label="ID（参照キー）"
              onChange={(e) => patch({ id: e.currentTarget.value })}
              placeholder="centerless"
              style={{ flex: 1, minWidth: 220 }}
              value={table.id}
              withAsterisk
            />
            <Select
              data={VALUE_TYPE_OPTIONS}
              label="戻り値の型"
              onChange={(v) =>
                patch({ valueType: (v as LookupValueType) ?? "number" })
              }
              value={table.valueType}
              w={120}
            />
            <TextInput
              description="一致なしの戻り値"
              label="既定値"
              onChange={(e) => patch({ default: e.currentTarget.value })}
              placeholder={table.valueType === "number" ? "0" : "(空)"}
              value={table.default ?? ""}
              w={140}
            />
          </Group>
          <LocalizedTextInput
            enProps={{
              value: table.name.en,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setName("en", e.currentTarget.value),
            }}
            jaProps={{
              value: table.name.ja,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setName("ja", e.currentTarget.value),
            }}
            label="表示名"
            placeholder="センタレス"
            required
          />
          <Textarea
            autosize
            label="説明"
            maxRows={3}
            minRows={1}
            onChange={(e) => patch({ description: e.currentTarget.value })}
            placeholder="任意"
            value={table.description ?? ""}
          />
        </Stack>
      </FormSection>

      <FormSection title="キー列">
        <Stack gap="xs">
          {table.keyColumns.map((c, ci) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: column has no stable id
            <Group align="flex-end" gap="sm" key={ci} wrap="nowrap">
              <TextInput
                label={ci === 0 ? "キー列名" : undefined}
                onChange={(e) => renameColumn(ci, e.currentTarget.value)}
                placeholder={`キー列${ci + 1}`}
                style={{ flex: 1 }}
                value={c}
              />
              <Select
                data={MATCH_OPTIONS}
                label={ci === 0 ? "照合方法" : undefined}
                onChange={(v) =>
                  setColumnMatch(ci, (v as LookupKeyMatch) ?? "exact")
                }
                value={table.keyMatch?.[ci] ?? "exact"}
                w={230}
              />
              <ActionIcon
                aria-label="キー列を削除"
                color="red"
                disabled={table.keyColumns.length <= 1}
                mb={4}
                onClick={() => removeColumn(ci)}
                variant="subtle"
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <GhostButton
            leftSection={<IconPlus size={14} />}
            onClick={addColumn}
            size="compact-sm"
          >
            キー列を追加
          </GhostButton>
        </Stack>
      </FormSection>

      <FormSection title="データ">
        <Group gap="xs" mb="sm">
          <SecondaryButton
            leftSection={<IconDownload size={14} />}
            onClick={downloadTemplate}
          >
            テンプレート/CSV
          </SecondaryButton>
          <SecondaryButton
            leftSection={<IconUpload size={14} />}
            onClick={() => fileRef.current?.click()}
          >
            CSV 取込
          </SecondaryButton>
          <Badge color="gray" variant="light">
            {table.rows.length} 行
          </Badge>
        </Group>
        <EditableCellTable
          addLabel="行を追加"
          columns={[
            ...table.keyColumns.map((c, ci) => ({
              header: c || `キー列${ci + 1}`,
              minWidth: 110,
            })),
            { header: "値", minWidth: 110 },
          ]}
          minTableWidth={360}
          onAddRow={addRow}
          onRemoveRow={(ri) => setRows(table.rows.filter((_, j) => j !== ri))}
          renderCell={(r, ri, ci) =>
            ci < table.keyColumns.length ? (
              <TextInput
                onChange={(e) =>
                  setRows(
                    table.rows.map((x, j) =>
                      j === ri
                        ? {
                            ...x,
                            keys: x.keys.map((k, m) =>
                              m === ci ? e.currentTarget.value : k,
                            ),
                          }
                        : x,
                    ),
                  )
                }
                size="xs"
                value={r.keys[ci] ?? ""}
              />
            ) : (
              <TextInput
                onChange={(e) =>
                  setRows(
                    table.rows.map((x, j) =>
                      j === ri ? { ...x, value: e.currentTarget.value } : x,
                    ),
                  )
                }
                placeholder={table.valueType === "number" ? "数値" : "文字列"}
                size="xs"
                value={r.value}
              />
            )
          }
          rows={table.rows}
        />
      </FormSection>

      <Group justify={isMobile ? "stretch" : "space-between"}>
        {!isNew ? (
          <DeleteButton fullWidth={isMobile} onClick={remove} />
        ) : (
          <span />
        )}
        <Group gap="sm" justify="flex-end">
          <CancelButton
            fullWidth={isMobile}
            onClick={() => router.push(LIST)}
          />
          <SaveButton fullWidth={isMobile} loading={isPending} onClick={save} />
        </Group>
      </Group>
    </Stack>
  );
}
