"use client";

/**
 * StatusBadge.tsx — Status enum → Mantine Badge。
 *
 * **表そのものは `lib/status-map.ts`** にあり、ここは描画だけを持つ。
 * `"use client"` モジュールの export はサーバから見るとクライアント参照に
 * なるため、ラベルの表（`STATUS_MAPS` / `statusLabel` / `statusOptions`）を
 * ここに置くと、Route Handler や帳票組み立てから**呼んだ瞬間に本番だけ**
 * 落ちる（詳しい経緯は lib/status-map.ts の頭）。値が要るときは
 * `@/lib/status-map` から取ること。
 *
 * Usage:
 *   <StatusBadge entity="Quote" status="ISSUED" />
 *   <StatusBadge entity="WorkOrderApproval" status="PENDING" />
 *
 * `"use client"` なのはラベルが `useLocale()` で閲覧者の言語に従うため —
 * Server Component から描画しても、`(dashboard)` レイアウトの
 * `NextIntlClientProvider` にぶら下がるクライアント葉になるだけで動く。
 */

import { Badge, type BadgeProps } from "@mantine/core";
import { useLocale } from "next-intl";
import {
  STATUS_MAPS,
  type StatusEntity,
  type StatusMap,
} from "@/lib/status-map";

interface StatusBadgeProps extends Omit<BadgeProps, "color" | "children"> {
  entity: StatusEntity;
  status: string;
}

/** Maps an entity status enum to its themed Badge. */
export function StatusBadge({ entity, status, ...props }: StatusBadgeProps) {
  const locale = useLocale();
  const def = (STATUS_MAPS[entity] as StatusMap)[status];
  const label = def ? (def.label[locale] ?? def.label.ja) : status;
  const color = def?.color ?? "gray";
  return (
    <Badge color={color} {...props}>
      {label}
    </Badge>
  );
}
