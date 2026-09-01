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
import { useTranslations } from "next-intl";
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
import {
  FormActions,
  FormSection,
  LocalizedTextInput,
} from "@/components/ui/shells";
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
  const tr = useTranslations();
  const isMobile = useIsMobile();
  const router = useRouter();
  const VALUE_TYPE_OPTIONS: { value: LookupValueType; label: string }[] = [
    { value: "number", label: tr("settings.lookupTableEditor.number") },
    { value: "string", label: tr("settings.lookupTableEditor.text") },
  ];
  const MATCH_OPTIONS: { value: LookupKeyMatch; label: string }[] = [
    { value: "exact", label: tr("settings.lookupTableEditor.exactMatch") },
    {
      value: "ge",
      label: tr("settings.lookupTableEditor.geTakeTheSmallest"),
    },
    {
      value: "le",
      label: tr("settings.lookupTableEditor.leTakeTheLargest"),
    },
  ];
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
  const setName = (lang: string, v: string) =>
    setTable((t) => ({ ...t, name: { ...t.name, [lang]: v } }));
  const setNameTranslations = (translations: Record<string, string>) =>
    setTable((t) => ({
      ...t,
      name: {
        ja: t.name.ja,
        en: translations.en || t.name.ja,
        ...translations,
      },
    }));

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
    const header = [...table.keyColumns, tr("common.value")];
    const body = table.rows.length
      ? table.rows.map((r) => [...r.keys, r.value])
      : [table.keyColumns.map(() => "")].map((k) => [...k, ""]);
    downloadCsv(`lookup_${safeName(table.id)}.csv`, toCsv([header, ...body]));
  };
  const onFile = async (file: File) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 1) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.lookupTableEditor.theCsvIsEmpty"),
        color: "red",
      });
      return;
    }
    const header = rows[0];
    if (header.length < 2) {
      notifications.show({
        title: tr("common.error2"),
        message: tr("settings.lookupTableEditor.thereAreNotEnoughColumnsKey"),
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
      title: tr("common.imported"),
      message: tr("settings.lookupTableEditor.rowsLoadedConfirmOnSave", {
        count: dataRows.length,
      }),
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
          title: tr("common.saved2"),
          message: tr("settings.lookupTableEditor.tableWasUpdated", {
            name: localized(table.name),
          }),
          color: "green",
        });
        router.push(LIST);
      } else {
        notifications.show({
          title: tr("common.error2"),
          message: res.error,
          color: "red",
        });
      }
    });
  };
  const remove = () =>
    openConfirm({
      title: tr("settings.lookupTableEditor.deleteTheTable"),
      message: tr("settings.lookupTableEditor.deleteTableConfirm", {
        name: localized(table.name),
      }),
      confirmLabel: tr("common.delete"),
      onConfirm: () =>
        startTransition(async () => {
          const res = await deleteLookupTable(table.id);
          if (res.ok) {
            notifications.show({
              title: tr("common.deleted"),
              message: tr("settings.lookupTableEditor.tableWasDeleted", {
                name: localized(table.name),
              }),
              color: "green",
            });
            router.push(LIST);
          } else {
            notifications.show({
              title: tr("common.error2"),
              message: res.error,
              color: "red",
            });
          }
        }),
    });

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        {isNew ? tr("settings.lookupTableEditor.newLookupTable") : ""}
        {tr("settings.lookupTableEditor.usedInTheFormulaAs")}{" "}
        <Code>
          lookup("{table.id || "id"}",{" "}
          {tr("settings.lookupTableEditor.key1Placeholder")}, ...)
        </Code>{" "}
        {tr("settings.lookupTableEditor.matchDescription")}
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

      <FormSection title={tr("settings.lookupTableEditor.tableSettings")}>
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <TextInput
              description={
                isNew
                  ? tr("settings.lookupTableEditor.theLookupKeyUsedAsLookup")
                  : tr(
                      "settings.lookupTableEditor.referenceKeyCannotBeChangedOnce",
                    )
              }
              disabled={!isNew}
              label={tr("settings.lookupTableEditor.iDReferenceKey")}
              onChange={(e) =>
                // 許可外の文字（空白・記号・全角）は入力時点で除去する。
                patch({
                  id: e.currentTarget.value.replace(/[^A-Za-z0-9_-]/g, ""),
                })
              }
              placeholder="centerless"
              style={{ flex: 1, minWidth: 220 }}
              value={table.id}
              withAsterisk
            />
            <Select
              data={VALUE_TYPE_OPTIONS}
              label={tr("settings.lookupTableEditor.returnType")}
              onChange={(v) =>
                patch({ valueType: (v as LookupValueType) ?? "number" })
              }
              value={table.valueType}
              w={120}
            />
            <TextInput
              description={tr(
                "settings.lookupTableEditor.valueReturnedWhenNothingMatches",
              )}
              label={tr("common.default")}
              onChange={(e) => patch({ default: e.currentTarget.value })}
              placeholder={
                table.valueType === "number"
                  ? "0"
                  : tr("settings.lookupTableEditor.empty")
              }
              value={table.default ?? ""}
              w={140}
            />
          </Group>
          <LocalizedTextInput
            jaProps={{
              value: table.name.ja,
              onChange: (e: ChangeEvent<HTMLInputElement>) =>
                setName("ja", e.currentTarget.value),
            }}
            label={tr("common.displayName")}
            placeholder={tr("settings.lookupTableEditor.centerless")}
            required
            translationsProps={{
              value: Object.fromEntries(
                Object.entries(table.name).filter(([k]) => k !== "ja"),
              ),
              onChange: setNameTranslations,
            }}
          />
          <Textarea
            autosize
            label={tr("common.description")}
            maxRows={3}
            minRows={1}
            onChange={(e) => patch({ description: e.currentTarget.value })}
            placeholder={tr("common.optional")}
            value={table.description ?? ""}
          />
        </Stack>
      </FormSection>

      <FormSection title={tr("settings.lookupTableEditor.keyColumn")}>
        <Stack gap="xs">
          {table.keyColumns.map((c, ci) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: column has no stable id
            <Group align="flex-end" gap="sm" key={ci} wrap="nowrap">
              <TextInput
                label={
                  ci === 0
                    ? tr("settings.lookupTableEditor.keyColumnName")
                    : undefined
                }
                onChange={(e) => renameColumn(ci, e.currentTarget.value)}
                placeholder={tr(
                  "settings.lookupTableEditor.keyColumnWithIndex",
                  {
                    index: ci + 1,
                  },
                )}
                style={{ flex: 1 }}
                value={c}
              />
              <Select
                data={MATCH_OPTIONS}
                label={
                  ci === 0
                    ? tr("settings.lookupTableEditor.matchMethod")
                    : undefined
                }
                onChange={(v) =>
                  setColumnMatch(ci, (v as LookupKeyMatch) ?? "exact")
                }
                value={table.keyMatch?.[ci] ?? "exact"}
                w={230}
              />
              <ActionIcon
                aria-label={tr("settings.lookupTableEditor.removeTheKeyColumn")}
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
            {tr("settings.lookupTableEditor.addAKeyColumn")}
          </GhostButton>
        </Stack>
      </FormSection>

      <FormSection title={tr("settings.lookupTableEditor.data")}>
        <Group gap="xs" mb="sm">
          <SecondaryButton
            leftSection={<IconDownload size={14} />}
            onClick={downloadTemplate}
          >
            {tr("settings.lookupTableEditor.templateCsv")}
          </SecondaryButton>
          <SecondaryButton
            leftSection={<IconUpload size={14} />}
            onClick={() => fileRef.current?.click()}
          >
            {tr("settings.lookupTableEditor.importCsv")}
          </SecondaryButton>
          <Badge color="gray" variant="light">
            {tr("settings.lookupTableEditor.rowsCount", {
              count: table.rows.length,
            })}
          </Badge>
        </Group>
        <EditableCellTable
          addLabel={tr("common.addRow")}
          columns={[
            ...table.keyColumns.map((c, ci) => ({
              header:
                c ||
                tr("settings.lookupTableEditor.keyColumnWithIndex", {
                  index: ci + 1,
                }),
              minWidth: 110,
            })),
            { header: tr("common.value"), minWidth: 110 },
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
                placeholder={
                  table.valueType === "number"
                    ? tr("settings.lookupTableEditor.number")
                    : tr("settings.lookupTableEditor.text")
                }
                size="xs"
                value={r.value}
              />
            )
          }
          rows={table.rows}
        />
      </FormSection>

      <FormActions>
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
            <SaveButton
              fullWidth={isMobile}
              loading={isPending}
              onClick={save}
            />
          </Group>
        </Group>
      </FormActions>
    </Stack>
  );
}
