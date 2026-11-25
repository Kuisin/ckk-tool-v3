"use client";

/**
 * OpenPoWarning — 素材入荷（直接調達）で、同じ素材の「発注済み・未入荷あり」の
 * 発注書があるときに出す確認。
 *
 * 発注した素材をここで入れると発注書の残数量が減らず、あとで発注書の
 * 「入荷完了」で同じ素材がもう一度入庫する。止めはしない（同じ素材を別に
 * 買うことはある）が、**確認のチェックが無いと保存できない** — サーバー側
 * （material-receipts/actions.ts）も同じ確認なしの保存を拒む。
 * 判定は lib/open-po-guard-core.ts。
 */

import { Alert, Anchor, Checkbox, List, Stack, Text } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { checkOpenPurchaseOrders } from "@/app/(dashboard)/purchase/material-receipts/actions";
import { docNo } from "@/lib/doc-number";
import type { OpenPoLine } from "@/lib/open-po-guard-core";

export function OpenPoWarning({
  candidates,
  acknowledged,
  onAcknowledgedChange,
  onConflictsChange,
}: {
  candidates: { itemId: string; supplierBpId: string | null }[];
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
  /** 当たりがあるかを親へ（保存ボタンの判断用）。 */
  onConflictsChange?: (hasConflicts: boolean) => void;
}) {
  const tr = useTranslations();
  const [conflicts, setConflicts] = useState<OpenPoLine[]>([]);
  // 候補が変わったら照会し直す（文字列化して比較 — 配列の同一性に頼らない）。
  const key = JSON.stringify(
    candidates.filter((c) => c.itemId).map((c) => [c.itemId, c.supplierBpId]),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: key が candidates の中身そのもの
  useEffect(() => {
    let alive = true;
    const list = candidates.filter((c) => c.itemId);
    if (list.length === 0) {
      setConflicts([]);
      onConflictsChange?.(false);
      return;
    }
    void checkOpenPurchaseOrders(list).then((r) => {
      if (!alive) return;
      const next = r.ok ? r.data : [];
      setConflicts(next);
      onConflictsChange?.(next.length > 0);
      // 当たる発注書が変わったら、前の確認は持ち越さない。
      onAcknowledgedChange(false);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  if (conflicts.length === 0) return null;
  return (
    <Alert
      color="orange"
      icon={<IconAlertTriangle size={16} />}
      title={tr("purchase.materialReceipts.openPo.title")}
    >
      <Stack gap="xs">
        <Text size="sm">{tr("purchase.materialReceipts.openPo.body")}</Text>
        <List size="sm" spacing={2}>
          {conflicts.map((c) => (
            <List.Item key={`${c.purchaseOrderId}:${c.itemId}`}>
              {tr("purchase.materialReceipts.openPo.line", {
                po: docNo(c.poNumber),
                remaining: c.remaining,
                unit: c.unit,
              })}{" "}
              <Anchor
                component={Link}
                href={`/purchase/purchase-orders/${encodeURIComponent(c.poNumber)}`}
                size="sm"
              >
                {tr("purchase.materialReceipts.openPo.open")}
              </Anchor>
            </List.Item>
          ))}
        </List>
        <Checkbox
          checked={acknowledged}
          label={tr("purchase.materialReceipts.openPo.acknowledge")}
          onChange={(e) => onAcknowledgedChange(e.currentTarget.checked)}
        />
      </Stack>
    </Alert>
  );
}
