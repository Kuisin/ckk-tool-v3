"use client";

/**
 * SalesRepSelect.tsx — 書類の営業担当セレクト（見積書・注文請書・出荷書 …）。
 *
 * 候補は **選択中の顧客に登録された営業担当**（取引先マスタ MS01 の顧客情報
 * → 営業担当）。顧客を選び直すと候補を取り直し、まだ担当が入っていなければ
 * その顧客の主担当（候補の先頭）を自動で入れる — サーバー側の保存処理
 * （lib/sales-rep resolveSalesRepId）と同じ既定値なので、画面と保存結果が
 * ずれない。
 *
 * 保存済みの担当が候補から外れていても選択肢に残す。顧客マスタから担当を
 * 外したときに、既存書類の担当が黙って空欄に化けるのを防ぐため。
 *
 * 顧客に担当が 1 人も登録されていないと、ここで選べるものが無く手が止まる。
 * そのため未登録のときだけ取引先マスタへの導線を出す（**別タブ** — 書きかけ
 * の書類を失わないため）。戻ってきたらウィンドウのフォーカスで候補を取り
 * 直すので、登録した担当がそのまま選べる。行き先は権限で変える —
 * 登録できる人（master:UPDATE）は編集画面、閲覧だけ（master:READ）は詳細。
 */

import { Anchor, Select } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { fetchSalesRepPicker } from "@/app/(dashboard)/_shared/option-search";
import { useTr } from "@/hooks/useTr";
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
  const tr = useTr();
  const [options, setOptions] = useState<Option[]>(() =>
    initial ? [{ value: initial.id, label: initial.name }] : [],
  );
  const [access, setAccess] = useState({ canView: false, canManage: false });
  // 初回は保存済みの値を尊重する（顧客が既に入っている編集画面で、
  // 候補を取り直した拍子に主担当へ書き換えてしまわないように）。
  const firstLoad = useRef(true);
  // 効果が見たいのは「顧客が変わったか」だけ。value / onChange を依存に
  // 入れると、担当を選ぶたびに候補を取り直して既定値で上書きしてしまう。
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  // 再取得時に「さっきまで候補ゼロだったか」を見るための控え。
  const known = useRef(options);
  known.current = options;

  useEffect(() => {
    let cancelled = false;
    if (!customerBpId) {
      setOptions([]);
      setAccess({ canView: false, canManage: false });
      if (!firstLoad.current) latest.current.onChange(null);
      firstLoad.current = false;
      return;
    }
    void fetchSalesRepPicker(customerBpId).then((picker) => {
      if (cancelled) return;
      setOptions(picker.options);
      setAccess({ canView: picker.canView, canManage: picker.canManage });
      const wasFirst = firstLoad.current;
      firstLoad.current = false;
      if (wasFirst) return;
      // 顧客が変わった: 候補外になった担当は外し、未設定なら主担当を入れる。
      const current = latest.current.value;
      const stillValid =
        current && picker.options.some((o) => o.value === current);
      if (!stillValid)
        latest.current.onChange(picker.options[0]?.value ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [customerBpId]);

  /**
   * 取引先マスタを別タブで開いて担当を登録し、戻ってきたときのための再取得。
   * 画面を読み込み直さずに候補へ反映する。
   */
  useEffect(() => {
    if (!customerBpId) return;
    let cancelled = false;
    const refresh = () => {
      void fetchSalesRepPicker(customerBpId).then((picker) => {
        if (cancelled) return;
        const hadNone = known.current.length === 0;
        setOptions(picker.options);
        setAccess({ canView: picker.canView, canManage: picker.canManage });
        // 自動で入れるのは「未登録だった顧客に**初めて**担当を登録した」
        // ときだけ。候補があったのに空 = 利用者が意図的に外したので戻さない。
        if (hadNone && !latest.current.value && picker.options[0]) {
          latest.current.onChange(picker.options[0].value);
        }
      });
    };
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [customerBpId]);

  // 保存済みの担当が候補に無い場合でも選べるように末尾へ残す。
  const withCurrent =
    value && !options.some((o) => o.value === value)
      ? [
          ...options,
          {
            value,
            label: tr("{v0}（候補外）", {
              v0: initial?.id === value ? initial.name : value,
            }),
          },
        ]
      : options;

  return { options: withCurrent, hasCandidates: options.length > 0, ...access };
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
  const tr = useTr();
  const { options, hasCandidates, canView, canManage } = useSalesRepOptions(
    customerBpId,
    value,
    onChange,
    initial,
  );

  /**
   * 候補ゼロで手が止まるときだけ出す導線。**閲覧（master:READ）以上**があれば
   * 出し、行き先は権限で変える — 登録できる人（master:UPDATE）は編集画面へ、
   * 閲覧だけの人は詳細へ（開けない画面には送らない）。どちらも無い人には
   * リンクを出さず、誰に頼めばよいかだけを書く。
   *
   * Input.Description は `<p>` なので、中に置けるのはインライン要素だけ
   * （Group/Stack を入れると <div> in <p> になる）。
   */
  const description =
    customerBpId && !hasCandidates ? (
      canView || canManage ? (
        <>
          {tr("この顧客に営業担当が未登録です。")}
          <Anchor
            href={
              canManage
                ? `/master/business-partners/${customerBpId}/edit`
                : `/master/business-partners/${customerBpId}`
            }
            rel="noopener noreferrer"
            target="_blank"
          >
            {canManage ? "取引先マスタで登録" : tr("取引先マスタで確認")}
            <IconExternalLink
              size={11}
              style={{ marginLeft: 2, verticalAlign: "-1px" }}
            />
          </Anchor>
        </>
      ) : (
        tr("この顧客に営業担当が未登録です（取引先マスタの管理者に登録を依頼）")
      )
    ) : undefined;

  return (
    <Select
      clearable
      data={options}
      description={description}
      disabled={disabled}
      label={label}
      onChange={onChange}
      placeholder={customerBpId ? "担当者を選択" : tr("先に顧客を選択")}
      searchable
      value={value}
    />
  );
}
