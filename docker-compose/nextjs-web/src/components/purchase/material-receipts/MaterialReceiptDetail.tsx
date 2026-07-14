"use client";

/**
 * MaterialReceiptDetail — 素材入荷 詳細 (PU21)。
 *
 * SummaryGrid + 証憑パネル。発注入荷なら関連する素材発注書へのリンクを
 * 表示する（直接調達はバッジ表示）。入荷は在庫入庫済みの確定記録のため
 * 編集・削除アクションは持たないが、証憑（納品書控え等）は常時添付できる。
 */

import { Anchor, Badge, Paper, Text } from "@mantine/core";
import Link from "next/link";
import {
  AttachmentsPanel,
  type AttachmentView,
} from "@/components/ui/AttachmentsPanel";
import { DocNumber } from "@/components/ui/DocNumber";
import { FieldValue } from "@/components/ui/FieldValue";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DetailShell, SummaryGrid } from "@/components/ui/shells";
import { formatDate, formatDateTime } from "@/lib/format";
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
  const r = receipt;
  return (
    <DetailShell
      breadcrumbs={["購買", { label: "素材入荷", href: BASE_PATH }, "詳細"]}
      createdAt={formatDateTime(r.createdAt)}
      status={
        r.poNumber ? (
          // 発注入荷 = 入荷完了した発注書由来（MaterialPurchaseOrder の完了色）。
          <StatusBadge entity="MaterialPurchaseOrder" status="COMPLETED" />
        ) : (
          <Badge color="gray" variant="light">
            直接調達
          </Badge>
        )
      }
      title={`素材入荷 ${r.materialCode}`}
    >
      <SummaryGrid>
        <FieldValue
          label="素材"
          value={
            <>
              <DocNumber>{r.materialCode}</DocNumber>
              <Text c="dimmed" size="xs">
                {r.materialName}
              </Text>
            </>
          }
        />
        <FieldValue label="仕入先" value={r.supplierName ?? "—"} />
        <FieldValue label="入荷先工場" value={r.factoryName ?? "—"} />
        <FieldValue
          label="数量"
          value={
            <Text className="tabular-nums" size="sm" span>
              {r.quantity} {r.unit}
            </Text>
          }
        />
        <FieldValue label="入荷日" value={formatDate(r.receivedAt)} />
        <FieldValue
          label="発注明細"
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
                直接調達（発注書なし）
              </Text>
            )
          }
        />
        <FieldValue label="備考" value={r.notes ?? "—"} />
      </SummaryGrid>

      {/* 証憑（納品書控え・検収書等） — 常時添付可 */}
      <Paper p="md" radius="md" withBorder>
        <AttachmentsPanel
          attachments={attachments}
          canDelete
          canUpload
          ownerId={r.id}
          ownerType="material_receipts"
          title="証憑"
        />
      </Paper>
    </DetailShell>
  );
}
