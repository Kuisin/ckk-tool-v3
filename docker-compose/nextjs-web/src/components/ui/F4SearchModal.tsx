"use client";

/**
 * F4SearchModal.tsx — SAP F4（値ヘルプ）風の詳細検索ポップアップ。
 *
 * SearchSelect の簡易検索（部分一致・上位N件）では絞り込みにくい大きな
 * マスタ向けに、複数フィルタ + 結果テーブルで検索して1件選ぶ。フィルタ定義と
 * 検索サーバーアクションは呼び出し側が渡す（エンティティ非依存の汎用部品）。
 *
 * 使い方は SearchSelect の `f4` prop 経由（ui/SearchSelect.tsx）。
 */

import {
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrimaryButton } from "@/components/ui/buttons";
import { DocNumber } from "@/components/ui/DocNumber";
import type { Option } from "@/lib/mock";

export interface F4FilterDef {
  key: string;
  label: string;
  /** select はプルダウン（options 必須）、既定は text。 */
  type?: "text" | "select";
  options?: Option[];
  placeholder?: string;
}

export interface F4Row {
  /** 選択時にフィールドへ入る値（id）。 */
  value: string;
  /** SearchSelect に表示するラベル。 */
  label: string;
  /** columns に対応するセル文字列。 */
  cells: string[];
}

export interface F4Config {
  title: string;
  filters: F4FilterDef[];
  columns: string[];
  /** サーバー検索（"use server" action）。上限件数はサーバー側で切る。 */
  onSearch: (filters: Record<string, string>) => Promise<F4Row[]>;
  description?: string;
}

export function F4SearchModal({
  opened,
  onClose,
  config,
  onPick,
}: {
  opened: boolean;
  onClose: () => void;
  config: F4Config;
  onPick: (row: F4Row) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<F4Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  const run = useCallback(
    (filters: Record<string, string>) => {
      const id = ++seq.current;
      setLoading(true);
      config
        .onSearch(filters)
        .then((r) => {
          if (seq.current === id) {
            setRows(r);
            setSearched(true);
          }
        })
        .catch(() => {
          if (seq.current === id) setRows([]);
        })
        .finally(() => {
          if (seq.current === id) setLoading(false);
        });
    },
    [config],
  );

  // 開いたら空条件で先頭を出す（F4 の初期一覧）
  useEffect(() => {
    if (opened) {
      setValues({});
      setSearched(false);
      run({});
    }
  }, [opened, run]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    run(values);
  };

  return (
    <Modal
      centered
      onClose={onClose}
      opened={opened}
      size="xl"
      title={config.title}
    >
      <Stack gap="sm">
        {config.description && (
          <Text c="dimmed" size="xs">
            {config.description}
          </Text>
        )}
        <form onSubmit={submit}>
          <Group align="flex-end" gap="xs" wrap="wrap">
            {config.filters.map((f) =>
              f.type === "select" ? (
                <Select
                  clearable
                  data={f.options ?? []}
                  key={f.key}
                  label={f.label}
                  onChange={(v) =>
                    setValues((s) => ({ ...s, [f.key]: v ?? "" }))
                  }
                  placeholder={f.placeholder}
                  searchable={(f.options?.length ?? 0) > 5}
                  value={values[f.key] || null}
                  w={180}
                />
              ) : (
                <TextInput
                  key={f.key}
                  label={f.label}
                  onChange={(e) =>
                    setValues((s) => ({ ...s, [f.key]: e.target.value }))
                  }
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ""}
                  w={180}
                />
              ),
            )}
            <PrimaryButton
              leftSection={<IconSearch size={14} />}
              loading={loading}
              type="submit"
            >
              検索
            </PrimaryButton>
          </Group>
        </form>

        <ScrollArea.Autosize mah={420}>
          <Table highlightOnHover stickyHeader striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                {config.columns.map((c) => (
                  <Table.Th key={c}>{c}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((r) => (
                <Table.Tr
                  className="cursor-pointer"
                  key={r.value}
                  onClick={() => {
                    onPick(r);
                    onClose();
                  }}
                >
                  {r.cells.map((cell, i) => (
                    <Table.Td key={config.columns[i] ?? i}>
                      {i === 0 ? <DocNumber>{cell}</DocNumber> : cell}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={config.columns.length}>
                    <Text c="dimmed" py="sm" size="sm" ta="center">
                      {loading
                        ? "検索中…"
                        : searched
                          ? "該当する結果がありません"
                          : ""}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Text c="dimmed" size="xs">
          行をクリックして選択（結果は最大50件 — 条件で絞り込んでください）
        </Text>
      </Stack>
    </Modal>
  );
}
