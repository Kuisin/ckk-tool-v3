"use client";

/**
 * ItemPicker — 在庫・所要量 (ST03) の品目 1 つを選ぶ入力。
 *
 * `SearchSelect`（コード/名称/キーワードで検索、最近使用つき）の薄いラッパー。
 * ラベルは `actions.ts` `searchItemOptions()` が「コード 名称（種別）」の形に
 * 組み立て済み — SearchSelect は plain な {value,label} の Select しか運べない
 * ため、種別バッジは色付きの Badge ではなく丸括弧のテキストとして埋め込む
 * （F4 詳細検索のような列付きテーブルではない、簡易な妥協）。
 */

import { searchItemOptions } from "@/app/(dashboard)/inventory/requirements/actions";
import { SearchSelect } from "@/components/ui/SearchSelect";
import type { RecentOption } from "@/lib/recents";

export function ItemPicker({
  value,
  onChange,
  initialOption,
  label,
  placeholder,
}: {
  value: string | null;
  onChange: (value: string | null, option?: RecentOption) => void;
  initialOption?: RecentOption | null;
  label?: string;
  placeholder?: string;
}) {
  return (
    <SearchSelect
      clearable
      initialOption={initialOption}
      label={label}
      onChange={onChange}
      onSearch={searchItemOptions}
      placeholder={placeholder}
      storageKey="stock-requirements-item"
      value={value}
    />
  );
}
