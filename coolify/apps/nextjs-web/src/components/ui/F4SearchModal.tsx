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
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
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

const NO_ROWS: F4Row[] = [];

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
  const tr = useTranslations();
  const [values, setValues] = useState<Record<string, string>>({});
  // 検索ボタンで確定した条件。入力中の values とは別に持つ（打つたびに
  // 検索しない — F4 は条件を揃えてから引く画面）。
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const instanceId = useId();
  const latestSearch = useRef(config.onSearch);
  latestSearch.current = config.onSearch;

  const query = useQuery({
    // 鍵はこのモーダル 1 つぶん。呼び出し側は config を毎回作り直すので、
    // 関数の同一性は鍵にしない（親の描き直しで検索し直さない）。
    queryKey: ["f4-search", instanceId, submitted],
    queryFn: () => latestSearch.current(submitted),
    enabled: opened,
    // 引き直している間は前の結果を出したままにする。
    placeholderData: keepPreviousData,
    retry: false,
  });
  const rows = query.isError ? NO_ROWS : (query.data ?? NO_ROWS);
  const loading = query.isFetching;
  const searched = query.isSuccess && !query.isPlaceholderData;

  // 開いたら空条件で先頭を出す（F4 の初期一覧）
  useEffect(() => {
    if (opened) {
      setValues({});
      setSubmitted({});
    }
  }, [opened]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const same =
      Object.keys({ ...submitted, ...values }).length ===
        Object.keys(values).length &&
      Object.entries(values).every(([k, v]) => submitted[k] === v);
    // 同じ条件でもう一度押したら取り直す（鍵が変わらないと自動では走らない）。
    if (same) void query.refetch();
    else setSubmitted({ ...values });
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
              {tr("ui.f4SearchModal.search")}
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
                        ? tr("ui.f4SearchModal.searching")
                        : searched
                          ? tr("ui.f4SearchModal.noMatchingResults")
                          : ""}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Text c="dimmed" size="xs">
          {tr("ui.f4SearchModal.clickARowToSelectIt")}
        </Text>
      </Stack>
    </Modal>
  );
}
