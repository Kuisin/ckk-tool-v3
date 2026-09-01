"use client";

/**
 * SearchSelect.tsx — サーバー検索 + 最近使用（localStorage）付き Select。
 *
 * 大きいマスタ（製品 4.3万件など）向け: 全 options をクライアントへ送らず、
 * 入力のたびにサーバーアクション（onSearch）で上位 N 件を取得する。
 * 空クエリでは「最近使用」（localStorage、storageKey ごと最大5件）を先頭に
 * 出し、無ければサーバーの先頭 N 件へフォールバックする。
 *
 * 使い方:
 *   <SearchSelect
 *     label="製品"
 *     storageKey="product"
 *     onSearch={searchProductOptions}   // "use server" action
 *     value={form.values.productId}
 *     onChange={(v) => form.setFieldValue("productId", v)}
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
import { notifications } from "@mantine/notifications";
import { IconZoomScan } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTr } from "@/hooks/useTr";
import { pushRecent, type RecentOption, readRecents } from "@/lib/recents";
import { type F4Config, F4SearchModal } from "./F4SearchModal";

const DEBOUNCE_MS = 250;

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
  const tr = useTr();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<RecentOption[]>([]);
  const [recents, setRecents] = useState<RecentOption[]>([]);
  const [loading, setLoading] = useState(false);
  // 選択済み option のラベルを保持（results が入れ替わっても表示を維持）
  const [selected, setSelected] = useState<RecentOption | null>(
    initialOption ?? null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
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
  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSearch(search)
        .then((rows) => {
          if (seq.current === id) setResults(rows);
        })
        .catch(() => {
          if (seq.current !== id) return;
          setResults([]);
          // 黙って「該当なし」にしない — 典型はデプロイ跨ぎの古いタブで
          // Server Action id が 404 になるケース。再読み込みで直ることを伝える。
          if (!errorNotified.current) {
            errorNotified.current = true;
            notifications.show({
              title: tr("検索に失敗しました"),
              message: tr(
                tr(
                  tr(
                    "通信エラーか、アプリが更新された可能性があります。ページを再読み込みしてください",
                  ),
                ),
              ),
              color: "red",
            });
          }
        })
        .finally(() => {
          if (seq.current === id) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [search, onSearch, tr]);

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
      groups.push({ group: tr("最近使用"), items: dedupe(recents) });
    }
    // 選択中 option を**先**に置く — 同じ value が検索結果に別ラベルで
    // 現れても、表示ラベルが選択時のものから変わらないようにする。
    // Mantine の searchable Select は選択中ラベルへ searchValue を同期する
    // ため、ラベルが results / selected の間で揺れると 同期 → 再検索 →
    // ラベル交代 → 同期 … の無限ループになる（出荷書フォームで発生）。
    const rest = dedupe(selected ? [selected, ...results] : results);
    if (rest.length > 0) {
      groups.push({
        group: search.trim() ? "検索結果" : tr("一覧（先頭のみ）"),
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
            <Tooltip label={tr("詳細検索（フィルタ）")} withArrow>
              <ActionIcon
                aria-label={tr("詳細検索")}
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
        nothingFoundMessage={loading ? "検索中…" : tr("該当なし")}
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
