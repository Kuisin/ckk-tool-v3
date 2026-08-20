"use client";

/**
 * QueueTabs — 作業キュー画面（未処理指示書 PD05 / 未処理出荷書 SH03）の
 * タブ見出し。
 *
 * 「未手配 3」のように件数バッジ付きで出す。件数 0 のタブはバッジを出さない
 * （0 のバッジは「片付いている」ことを目立たせるだけで注意を引く必要がない）。
 * 中身は呼び出し側が 1 つだけ描画する — タブごとに DataTable を分けても
 * URL 状態（ページ・ソート）が 1 本で済むようにするため。
 */

import { Badge, Tabs } from "@mantine/core";
import type { ReactNode } from "react";

export interface QueueTabDef {
  value: string;
  label: string;
  icon: ReactNode;
  count: number;
  /** 件数バッジの色（既定 blue）。滞留を示すタブは orange など。 */
  color?: string;
}

export function QueueTabs({
  tabs,
  value,
  onChange,
  children,
}: {
  tabs: QueueTabDef[];
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <Tabs onChange={(v) => onChange(v ?? tabs[0].value)} value={value}>
      <Tabs.List mb="sm">
        {tabs.map((t) => (
          <Tabs.Tab
            key={t.value}
            leftSection={t.icon}
            rightSection={
              t.count > 0 ? (
                <Badge
                  circle
                  color={t.color ?? "blue"}
                  size="sm"
                  variant="light"
                >
                  {t.count}
                </Badge>
              ) : undefined
            }
            value={t.value}
          >
            {t.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {children}
    </Tabs>
  );
}
