"use client";

/**
 * CustomerSuggestions — 顧客が 1 件に決まらなかったときの「もしかして」。
 *
 * 突合（lib/bp-match）は、当たりが 1 件に絞れたときだけ顧客を自動で入れる。
 * 略称で書かれている・同名の取引先が複数ある、といった場合は**わざと決めない**
 * ので、その代わりに当たった候補をここへ出す。ピッカーで社名を打ち直させると、
 * 「AI が読んだ社名」と「マスタの表記」がずれているときほど探しにくい
 * （ずれているからこそ突合が外れている）。
 *
 * 押した瞬間に顧客欄へ入る。保存するまで確定はしないので、間違えても選び直せる。
 */

import { Group, Text } from "@mantine/core";
import { SecondaryButton } from "@/components/ui/buttons";
import type { CustomerSuggestion } from "./model";

export function CustomerSuggestions({
  suggestions,
  onPick,
}: {
  suggestions: CustomerSuggestion[];
  onPick: (id: string) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <Group gap="xs" wrap="wrap">
      <Text c="dimmed" size="xs">
        もしかして
      </Text>
      {suggestions.map((s) => (
        <SecondaryButton key={s.id} onClick={() => onPick(s.id)} size="xs">
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
