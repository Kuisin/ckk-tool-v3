"use client";

/**
 * HelpLabel — input label + "?" help icon（ホバーで説明を表示）.
 *
 * Mantine input の `label` prop に渡して使う:
 *   <NumberInput label={<HelpLabel label="基準単価" help="…" />} … />
 * テーブルヘッダー等のプレーンテキストにも使える。
 *
 * `manual` を渡すと、説明の下に「もっと読む」が付いたポップアップになる
 * （マニュアルの該当項目へ別タブで飛ぶ）。Tooltip の中はクリックできないため、
 * その場合だけ HoverCard に切り替える。`manual` 無しは従来どおり Tooltip。
 * 要約とリンク先は lib/field-help.ts にまとめてある — 直接書かずに
 * `fieldHelp("quote", "deliveryDate")` を label に展開して使う。
 */

import { Anchor, HoverCard, Text, ThemeIcon, Tooltip } from "@mantine/core";
import { IconExternalLink, IconHelp } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useTr } from "@/hooks/useTr";

function HelpIcon({ label }: { label: ReactNode }) {
  return (
    <ThemeIcon
      aria-label={`${typeof label === "string" ? label : ""}の説明`}
      color="gray"
      radius="xl"
      size={14}
      style={{ cursor: "help" }}
      variant="light"
    >
      <IconHelp size={11} />
    </ThemeIcon>
  );
}

export function HelpLabel({
  label,
  help,
  required,
  manual,
}: {
  label: ReactNode;
  /** ホバー（フォーカス・タッチ）時に表示する説明文. */
  help: string;
  /** 必須項目。ラベル直後に赤い * を表示する（? アイコンより前）。 */
  required?: boolean;
  /**
   * マニュアルの該当箇所（`operations/sales/quote/user#field-delivery-date`）。
   * 指定すると「もっと読む」リンク付きのポップアップになる。
   */
  manual?: string;
}) {
  const tr = useTr();
  return (
    <Text
      component="span"
      inherit
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {label}
      {required && (
        <span aria-hidden className="required-asterisk">
          {" *"}
        </span>
      )}
      {manual ? (
        // openDelay を短くしすぎるとフォーム操作中に出っぱなしになる。
        <HoverCard openDelay={150} position="top-start" shadow="md" width={300}>
          <HoverCard.Target>
            {/* タッチ・キーボードでも開けるようリンクにする（同じ遷移先）。 */}
            <Anchor
              aria-label={`${typeof label === "string" ? label : ""}の説明を読む`}
              href={`/manual/ja/${manual}`}
              onClick={(e) => e.stopPropagation()}
              rel="noopener noreferrer"
              style={{ display: "inline-flex" }}
              target="_blank"
            >
              <HelpIcon label={label} />
            </Anchor>
          </HoverCard.Target>
          <HoverCard.Dropdown>
            <Text size="xs">{help}</Text>
            <Anchor
              href={`/manual/ja/${manual}`}
              rel="noopener noreferrer"
              size="xs"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              target="_blank"
            >
              {tr("もっと読む")}
              <IconExternalLink size={11} />
            </Anchor>
          </HoverCard.Dropdown>
        </HoverCard>
      ) : (
        <Tooltip
          events={{ hover: true, focus: true, touch: true }}
          label={help}
          multiline
          position="top-start"
          w={280}
          withinPortal
        >
          <HelpIcon label={label} />
        </Tooltip>
      )}
    </Text>
  );
}
