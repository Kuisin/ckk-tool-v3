"use client";

/**
 * HelpLabel — input label + "?" help icon（ホバーで説明を表示）.
 *
 * Mantine input の `label` prop に渡して使う:
 *   <NumberInput label={<HelpLabel label="基準単価" help="…" />} … />
 * テーブルヘッダー等のプレーンテキストにも使える。
 */

import { Text, ThemeIcon, Tooltip } from "@mantine/core";
import { IconHelp } from "@tabler/icons-react";
import type { ReactNode } from "react";

export function HelpLabel({
  label,
  help,
}: {
  label: ReactNode;
  /** ホバー（フォーカス・タッチ）時に表示する説明文. */
  help: string;
}) {
  return (
    <Text
      component="span"
      inherit
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {label}
      <Tooltip
        events={{ hover: true, focus: true, touch: true }}
        label={help}
        multiline
        position="top-start"
        w={280}
        withinPortal
      >
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
      </Tooltip>
    </Text>
  );
}
