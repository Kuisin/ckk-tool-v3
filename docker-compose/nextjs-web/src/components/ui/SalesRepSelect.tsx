"use client";

/**
 * SalesRepSelect.tsx — 書類の営業担当セレクト（見積書・注文請書・出荷書 …）。
 *
 * 候補は **選択中の顧客に登録された営業担当**（取引先マスタ MS01 の顧客情報
 * → 営業担当）。顧客を選び直すと候補を取り直し、まだ担当が入っていなければ
 * その顧客の主担当（候補の先頭）を自動で入れる — サーバー側の保存処理
 * （resolveSalesRep 相当）と同じ既定値なので、画面と保存結果がずれない。
 *
 * 保存済みの担当が候補から外れていても選択肢に残す。顧客マスタから担当を
 * 外したときに、既存書類の担当が黙って空欄に化けるのを防ぐため。
 */

import { Select } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { fetchSalesRepOptions } from "@/app/(dashboard)/_shared/option-search";
import type { Option } from "@/lib/mock";

/**
 * 顧客に紐づく営業担当の候補を追いかける。
 *
 * `initial` は保存済みの担当（候補外に落ちていても選択肢に残すため、
 * id と表示名の両方が要る）。
 */
export function useSalesRepOptions(
  customerBpId: string | null,
  value: string | null,
  onChange: (value: string | null) => void,
  initial?: { id: string; name: string } | null,
) {
  const [options, setOptions] = useState<Option[]>(() =>
    initial ? [{ value: initial.id, label: initial.name }] : [],
  );
  // 初回は保存済みの値を尊重する（顧客が既に入っている編集画面で、
  // 候補を取り直した拍子に主担当へ書き換えてしまわないように）。
  const firstLoad = useRef(true);
  // 効果が見たいのは「顧客が変わったか」だけ。value / onChange を依存に
  // 入れると、担当を選ぶたびに候補を取り直して既定値で上書きしてしまう。
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  useEffect(() => {
    let cancelled = false;
    if (!customerBpId) {
      setOptions([]);
      if (!firstLoad.current) latest.current.onChange(null);
      firstLoad.current = false;
      return;
    }
    void fetchSalesRepOptions(customerBpId).then((next) => {
      if (cancelled) return;
      setOptions(next);
      const wasFirst = firstLoad.current;
      firstLoad.current = false;
      if (wasFirst) return;
      // 顧客が変わった: 候補外になった担当は外し、未設定なら主担当を入れる。
      const current = latest.current.value;
      const stillValid = current && next.some((o) => o.value === current);
      if (!stillValid) latest.current.onChange(next[0]?.value ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [customerBpId]);

  // 保存済みの担当が候補に無い場合でも選べるように末尾へ残す。
  const withCurrent =
    value && !options.some((o) => o.value === value)
      ? [
          ...options,
          {
            value,
            label: `${initial?.id === value ? initial.name : value}（候補外）`,
          },
        ]
      : options;

  return { options: withCurrent, hasCandidates: options.length > 0 };
}

export function SalesRepSelect({
  customerBpId,
  value,
  onChange,
  initial,
  label = "営業担当",
  disabled,
}: {
  customerBpId: string | null;
  value: string | null;
  onChange: (value: string | null) => void;
  /** 保存済みの担当（id + 表示名）。新規作成では省略。 */
  initial?: { id: string; name: string } | null;
  label?: string;
  disabled?: boolean;
}) {
  const { options, hasCandidates } = useSalesRepOptions(
    customerBpId,
    value,
    onChange,
    initial,
  );
  return (
    <Select
      clearable
      data={options}
      description={
        customerBpId && !hasCandidates
          ? "この顧客に営業担当が未登録です（取引先マスタで登録）"
          : undefined
      }
      disabled={disabled}
      label={label}
      onChange={onChange}
      placeholder={customerBpId ? "担当者を選択" : "先に顧客を選択"}
      searchable
      value={value}
    />
  );
}
