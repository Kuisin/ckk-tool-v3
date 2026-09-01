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
import { useTranslations } from "next-intl";
import { useFormat } from "@/components/layout/PreferencesProvider";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
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
  const tr = useTranslations();
  const fmt = useFormat();
  const r = receipt;
  return (
    <DetailShell
      breadcrumbs={[
        tr("common.purchasing"),
        { label: tr("common.materialReceipt"), href: BASE_PATH },
        "詳細",
      ]}
      createdAt={fmt.dateTime(r.createdAt)}
      status={
        r.poNumber ? (
          // 発注入荷 = 入荷完了した発注書由来（MaterialPurchaseOrder の完了色）。
          <StatusBadge entity="MaterialPurchaseOrder" status="COMPLETED" />
        ) : (
          <Badge color="gray" variant="light">
            {tr("common.directPurchase")}
          </Badge>
        )
      }
      title={`素材入荷 ${r.materialCode}`}
    >
      <SummaryGrid>
        <FieldValue
          label={tr("common.materials")}
          value={
            <>
              <DocNumber>{r.materialCode}</DocNumber>
              <Text c="dimmed" size="xs">
                {r.materialName}
              </Text>
            </>
          }
        />
        <FieldValue
          label={tr("common.supplier")}
          value={r.supplierName ?? "—"}
        />
        <FieldValue
          label={tr("common.receivingSite")}
          value={r.plantName ?? "—"}
        />
        <FieldValue
          label={tr("common.quantity")}
          value={
            <Text className="tabular-nums" size="sm" span>
              {r.quantity} {r.unit}
            </Text>
          }
        />
        <FieldValue
          label={tr("common.receivedDate")}
          value={fmt.date(r.receivedAt)}
        />
        <FieldValue label={tr("common.createdBy")} value={r.createdByName} />
        <FieldValue
          label={tr("common.orderLines")}
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
                {tr("purchase.materialReceipts.directPurchaseNoPurchaseOrder")}
              </Text>
            )
          }
        />
        <FieldValue label={tr("common.notes")} value={r.notes ?? "—"} />
      </SummaryGrid>

      {/* 証憑（納品書控え・検収書等） — 常時添付可 */}
      <Paper p="md" radius="md" withBorder>
        <AttachmentsPanel
          attachments={attachments}
          canDelete
          canUpload
          ownerId={r.id}
          ownerType="material_receipts"
          title={tr("common.supportingDocument")}
        />
      </Paper>
    </DetailShell>
  );
}
