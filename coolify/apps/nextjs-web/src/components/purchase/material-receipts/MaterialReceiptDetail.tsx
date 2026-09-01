"use client";

/**
 * MaterialReceiptDetail — 素材入荷 詳細 (PU23)。
 *
 * SummaryGrid + 証憑パネル。発注入荷なら関連する素材発注書へのリンクを
 * 表示する（直接調達はバッジ表示）。入荷は在庫入庫済みの確定記録のため
 * 編集・削除アクションは持たないが、証憑（納品書控え等）は常時添付できる。
 */

import { Anchor, Badge, Paper, Text } from "@mantine/core";
import Link from "next/link";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { useTr } from "@/hooks/useTr";
import type { MaterialReceiptView } from "./model";

const BASE_PATH = "/purchase/material-receipts";
const PO_PATH = "/purchase/purchase-orders";

export function MaterialReceiptDetail({
  receipt,
  attachments,
}: {
  receipt: MaterialReceiptView;
  /** 証憑（document_attachments 由来）。 */
  attachments: AttachmentView[];
}) {
  const tr = useTr();
  const fmt = useFormat();
  const r = receipt;
  return (
    <DetailShell
      breadcrumbs={[
        tr("購買"),
        { label: tr("素材入荷"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(r.createdAt)}
      status={
        r.poNumber ? (
          // 発注入荷 = 入荷完了した発注書由来（MaterialPurchaseOrder の完了色）。
          <StatusBadge entity="MaterialPurchaseOrder" status="COMPLETED" />
        ) : (
          <Badge color="gray" variant="light">
            {tr("直接調達")}
          </Badge>
        )
      }
      title={`素材入荷 ${r.materialCode}`}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("素材")}
          value={
            <>
              <DocNumber>{r.materialCode}</DocNumber>
              <Text c="dimmed" size="xs">
                {r.materialName}
              </Text>
            </>
          }
        />
        <FieldValue label={tr("仕入先")} value={r.supplierName ?? "—"} />
        <FieldValue label={tr("入荷先拠点")} value={r.plantName ?? "—"} />
        <FieldValue
          label={tr("数量")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {r.quantity} {r.unit}
            </Text>
          }
        />
        <FieldValue label={tr("入荷日")} value={fmt.date(r.receivedAt)} />
        <FieldValue label={tr("作成者")} value={r.createdByName} />
        <FieldValue
          label={tr("発注明細")}
          value={
            r.poNumber ? (
              <Anchor
                component={Link}
                href={`${PO_PATH}/${r.poNumber}`}
                size="sm"
              >
                <DocNumber c="blue">{r.poNumber}</DocNumber>
              </Anchor>
            ) : (
              <Text c="dimmed" size="sm" span>
                {tr("直接調達（発注書なし）")}
              </Text>
            )
          }
        />
        <FieldValue label={tr("備考")} value={r.notes ?? "—"} />
      </SummaryGrid>

      {/* 証憑（納品書控え・検収書等） — 常時添付可 */}
      <Paper p="md" radius="md" withBorder>
        <AttachmentsPanel
          attachments={attachments}
          canDelete
          canUpload
          ownerId={r.id}
          ownerType="material_receipts"
          title={tr("証憑")}
        />
      </Paper>
    </DetailShell>
  );
}
