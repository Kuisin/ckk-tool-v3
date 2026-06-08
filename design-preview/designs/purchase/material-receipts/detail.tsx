'use client';

import { useState } from 'react';
import { Tabs, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { FieldValue, formatDate, formatDateTime } from '../../lib/ui';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { DeleteMaterialReceiptModal } from './_modals/delete';

// ── Mock data ────────────────────────────────────────────────────────────────
const RECEIPT = {
  materialCode: 'A01A0001-A001-001',
  materialName: 'SUS303 φ20×3000（研磨）',
  supplierName: '山陽素材商事',
  quantity: 100,
  unit: '本',
  receivedAt: '2026-05-28',
  notes: '検収済み。ミルシート添付。',
  createdBy: '田中 太郎',
  createdAt: '2026-05-28 14:30',
};

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-28 14:35', detail: '素材在庫へ入庫（+100 本）' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2026-05-28 14:30', detail: '素材入荷を登録' },
];

export default function MaterialReceiptDetailPage() {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '購買', '素材入荷', RECEIPT.materialCode]}
      title={RECEIPT.materialName}
      createdAt={`${formatDateTime(RECEIPT.createdAt)}（${RECEIPT.createdBy}）`}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '取消', icon: <IconTrash size={14} />, color: 'red', onClick: () => setDeleteOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="素材コード" value={<Text size="sm" ff="mono">{RECEIPT.materialCode}</Text>} />
        <FieldValue label="素材" value={RECEIPT.materialName} />
        <FieldValue label="仕入先" value={RECEIPT.supplierName} />
        <FieldValue label="数量" value={`${RECEIPT.quantity} ${RECEIPT.unit}`} />
        <FieldValue label="入荷日" value={formatDate(RECEIPT.receivedAt)} />
        <FieldValue label="備考" value={RECEIPT.notes} />
      </SummaryGrid>

      <Tabs defaultValue="history">
        <Tabs.List>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <DeleteMaterialReceiptModal
        opened={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        label={`${RECEIPT.materialName}（${RECEIPT.quantity} ${RECEIPT.unit}）`}
      />
    </DetailShell>
  );
}
