"use client";

/**
 * SearchSelect.tsx — サーバー検索 + 最近使用（localStorage）付き Select。
 *
 * 大きいマスタ（製品 4.3万件など）向け: 全 options をクライアントへ送らず、
 * 入力のたびにサーバーアクション（onSearch）で上位 N 件を取得する。
 * 空クエリでは「最近使用」（localStorage、storageKey ごと最大5件）を先頭に
 * 出し、無ければサーバーの先頭 N 件へフォールバックする。
 *
 * 検索結果は TanStack Query に載せる（鍵 = 検索関数 × 入力）。同じ検索を
 * 使う欄どうしは結果を共有し、一度引いた入力はキャッシュから即座に出したうえで
 * 必ず取り直す（マスタは別の画面で増えるので、古い結果を正にしない）。
 * 打鍵の追い越し（遅い応答が新しい結果を上書きする）は鍵が違うので起きない。
 *
 * 使い方:
 *   <SearchSelect
 *     label="製品"
 *     storageKey="product"
 *     onSearch={searchProductItemOptions}   // "use server" action
 *     value={form.values.itemId}
 *     onChange={(v) => form.setFieldValue("itemId", v)}
 *     initialOption={…}                 // 編集時: 既存値の {value,label}
 *   />
 */

import {
  ActionIcon,
  Loader,
  Select,
  type SelectProps,
  Tooltip,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconZoomScan } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { fnKey } from "@/lib/query-client";
import { pushRecent, type RecentOption, readRecents } from "@/lib/recents";
import { type F4Config, F4SearchModal } from "./F4SearchModal";

const DEBOUNCE_MS = 250;
const EMPTY: RecentOption[] = [];

export interface SearchSelectProps
  extends Omit<
    SelectProps,
    "data" | "value" | "onChange" | "searchable" | "filter" | "onSearchChange"
  > {
  /** 選択値（id）。 */
  value: string | null;
  /** 第2引数で選択 option（label 込み）も受け取れる。 */
  onChange: (value: string | null, option?: RecentOption) => void;
  /** サーバー検索。空文字で先頭 N 件を返すこと。 */
  onSearch: (query: string) => Promise<RecentOption[]>;
  /** 最近使用の localStorage キー（例: "product", "customer"）。 */
  storageKey: string;
  /**
   * 選択中の値のラベルを出すための option（編集フォームの既存値など）。
   * **後から差し替えてもよい** — 呼び出し側が value を外から動かしたとき
   * （候補ボタンで選ばせる等）に、同じ option を渡せば表示も追随する。
   */
  initialOption?: RecentOption | null;
  /** SAP F4 風の詳細検索ポップアップ（フィルタ + 結果テーブル）。 */
  f4?: F4Config;
}

export function SearchSelect({
  value,
  onChange,
  onSearch,
  storageKey,
  initialOption,
  f4,
  ...selectProps
}: SearchSelectProps) {
  const tr = useTranslations();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<RecentOption[]>([]);
  // 選択済み option のラベルを保持（results が入れ替わっても表示を維持）
  const [selected, setSelected] = useState<RecentOption | null>(
    initialOption ?? null,
  );
  // 検索アクションの失敗通知は 1 マウント 1 回（デバウンスごとに鳴らさない）
  const errorNotified = useRef(false);
  const [f4Open, setF4Open] = useState(false);

  // localStorage は client でしか読めない — SSR ミスマッチ回避のため effect で
  useEffect(() => {
    setRecents(readRecents(storageKey));
  }, [storageKey]);

  // 外から選択値が差し替わったとき（候補ボタンなど）にラベルを追随させる。
  // 取り込むのは **いま選ばれている値のラベル** だけ（option.value === value）—
  // 利用者がクリアしたのに古いラベルが戻る、という動きを避けるため。
  // 値が同じ間は何もしないので、毎レンダー新しいオブジェクトを渡しても回らない。
  const initialValue = initialOption?.value;
  useEffect(() => {
    if (initialOption && initialValue === value && value !== selected?.value) {
      setSelected(initialOption);
    }
  }, [initialOption, initialValue, value, selected?.value]);

  // デバウンス付きサーバー検索。空クエリも投げる（先頭 N 件フォールバック用）
  const [debounced] = useDebouncedValue(search, DEBOUNCE_MS);
  // 検索関数も鍵の一部（別の検索の結果を引かないため）。呼び出し側が条件を
  // 閉じ込めた関数（`(q) => search(q, customerId)`）は親のレンダーごとに
  // 作り直されるので、入力と同じ間隔で落ち着くのを待ってから鍵にする —
  // 親が 1 打ごとに描き直すフォームで、その回数ぶん取りに行かない。
  const [searchFnId] = useDebouncedValue(fnKey(onSearch), DEBOUNCE_MS);
  const latestSearch = useRef(onSearch);
  latestSearch.current = onSearch;
  const query = useQuery({
    queryKey: ["search-select", searchFnId, debounced],
    queryFn: () => latestSearch.current(debounced),
    // 打っている間は前の結果を出したままにする（候補が一瞬消えない）。
    placeholderData: keepPreviousData,
    // 典型的な失敗はデプロイ跨ぎの Server Action 404 — 繰り返しても直らない。
    retry: false,
  });
  // 失敗したら「該当なし」と同じ空の一覧にする（前の結果を出し続けない）。
  const results = query.isError ? EMPTY : (query.data ?? EMPTY);
  const loading = query.isFetching || search !== debounced;

  // 黙って「該当なし」にしない — 典型はデプロイ跨ぎの古いタブで
  // Server Action id が 404 になるケース。再読み込みで直ることを伝える。
  useEffect(() => {
    if (!query.isError || errorNotified.current) return;
    errorNotified.current = true;
    notifications.show({
      title: tr("ui.searchSelect.theSearchFailed"),
      message: tr("ui.searchSelect.aCommunicationErrorOrTheApp"),
      color: "red",
    });
  }, [query.isError, tr]);

  const data = useMemo(() => {
    const seen = new Set<string>();
    const dedupe = (rows: RecentOption[]) =>
      rows.filter((r) => {
        if (seen.has(r.value)) return false;
        seen.add(r.value);
        return true;
      });
    const groups: { group: string; items: RecentOption[] }[] = [];
    // 空クエリのときだけ最近使用を先頭に
    if (!search.trim() && recents.length > 0) {
      groups.push({
        group: tr("ui.searchSelect.recentlyUsed"),
        items: dedupe(recents),
      });
    }
    // 選択中 option を**先**に置く — 同じ value が検索結果に別ラベルで
    // 現れても、表示ラベルが選択時のものから変わらないようにする。
    // Mantine の searchable Select は選択中ラベルへ searchValue を同期する
    // ため、ラベルが results / selected の間で揺れると 同期 → 再検索 →
    // ラベル交代 → 同期 … の無限ループになる（出荷書フォームで発生）。
    const rest = dedupe(selected ? [selected, ...results] : results);
    if (rest.length > 0) {
      groups.push({
        group: search.trim() ? "検索結果" : tr("ui.searchSelect.listFirstOnly"),
        items: rest,
      });
    }
    return groups;
  }, [search, results, recents, selected, tr]);

  const pick = (picked: RecentOption) => {
    onChange(picked.value, picked);
    setSelected(picked);
    setRecents(pushRecent(storageKey, picked));
  };

  return (
    <>
      <Select
        clearable
        data={data}
        // サーバーが絞り込むのでクライアント側フィルタは無効化
        filter={({ options }) => options}
        leftSection={
          f4 ? (
            <Tooltip
              label={tr("ui.searchSelect.advancedSearchFilters")}
              withArrow
            >
              <ActionIcon
                aria-label={tr("ui.searchSelect.advancedSearch")}
                color="gray"
                onClick={() => setF4Open(true)}
                size="sm"
                variant="subtle"
              >
                <IconZoomScan size={16} />
              </ActionIcon>
            </Tooltip>
          ) : undefined
        }
        leftSectionPointerEvents={f4 ? "auto" : undefined}
        nothingFoundMessage={
          loading ? "検索中…" : tr("ui.searchSelect.noResults")
        }
        onChange={(v, option) => {
          if (v && option) {
            pick({ value: v, label: option.label });
          } else {
            onChange(null);
            setSelected(null);
          }
        }}
        onSearchChange={setSearch}
        rightSection={loading ? <Loader size={14} /> : undefined}
        searchable
        searchValue={search}
        value={value}
        {...selectProps}
      />
      {f4 && (
        <F4SearchModal
          config={f4}
          onClose={() => setF4Open(false)}
          onPick={(row) => pick({ value: row.value, label: row.label })}
          opened={f4Open}
        />
      )}
    </>
  );
}
