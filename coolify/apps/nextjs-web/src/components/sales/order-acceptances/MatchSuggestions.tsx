"use client";

/**
 * MatchSuggestions — 突合が 1 件に決まらなかったときの「もしかして」。
 * 顧客（lib/bp-match）と明細の製品（lib/product-match）で同じものを使う。
 *
 * 突合は、当たりが 1 件に絞れたときだけ自動で入れる。略記で書かれている・
 * 同族の登録が複数ある、といった場合は**わざと決めない**ので、その代わりに
 * 当たった候補をここへ出す。ピッカーで打ち直させると、「AI が読んだ文字列」と
 * 「マスタの表記」がずれているときほど探しにくい（ずれているからこそ突合が
 * 外れている）。
 *
 * 押した瞬間に欄へ入る。保存するまで確定はしないので、間違えても選び直せる。
 */

import { Group, Text } from "@mantine/core";
import { SecondaryButton } from "@/components/ui/buttons";
import { useTr } from "@/hooks/useTr";
import type { MatchSuggestion } from "./model";

export function MatchSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: MatchSuggestion[];
  onPick: (suggestion: MatchSuggestion) => void;
}) {
  const tr = useTr();
  if (suggestions.length === 0) return null;
  return (
    <Group gap="xs" wrap="wrap">
      <Text c="dimmed" size="xs">
        {tr("もしかして")}
      </Text>
      {suggestions.map((s) => (
        <SecondaryButton key={s.id} onClick={() => onPick(s)} size="xs">
          {s.label}
          {/* なぜ候補になったか — マスタ側の当たった表記を添える。 */}
          {s.matchedKey !== s.label && (
            <Text c="dimmed" component="span" inherit>
              （{s.matchedKey}）
            </Text>
          )}
        </SecondaryButton>
      ))}
    </Group>
  );
}
