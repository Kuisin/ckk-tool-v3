'use client';

import { useState } from 'react';
import { Divider, Group, Stack, Tabs, Text } from '@mantine/core';
import {
  IconCalendarStats,
  IconPackageImport,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDate, formatDateTime } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { RecordArrivalModal } from './_modals/record-arrival';
import { CancelOutsourceOrderModal } from './_modals/cancel';
import { RescheduleOutsourceOrderModal } from './_modals/reschedule';

// ── Mock data ────────────────────────────────────────────────────────────────
const ORDER = {
  supplierName: '外注研磨株式会社',
  stepName: 'センタレス',
  workOrderNumber: 1042,
  productName: '精密軸 PRD-2601-0001',
  status: 'IN_PROGRESS',
  requestedAt: '2026-05-26',
  expectedAt: '2026-06-02',
  receivedAt: null as string | null,
  notes: 'φ20 → φ19.98 仕上げ。RA0.4 以下。',
  createdBy: '中村 花子',
  createdAt: '2026-05-26 13:00',
  updatedAt: '2026-05-26 13:00',
};

const AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '中村 花子', at: '2026-05-26 13:00', detail: 'センタレス: 外注依頼（外注研磨株式会社）' },
  { id: 2, action: 'CREATE', user: '鈴木 一郎', at: '2026-05-20 09:15', detail: '指示書 #1042 の工程として生成' },
];

export default function OutsourceOrderDetailPage() {
  const label = `${ORDER.supplierName} — ${ORDER.stepName}（指示書 #${ORDER.workOrderNumber}）`;

  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '購買', '外注依頼', `指示書 #${ORDER.workOrderNumber}`]}
      title={`外注依頼 — ${ORDER.stepName}`}
      status={<StatusBadge entity="Step" status={ORDER.status} />}
      createdAt={`${formatDateTime(ORDER.createdAt)}（${ORDER.createdBy}）`}
      updatedAt={formatDateTime(ORDER.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '入荷を記録', icon: <IconPackageImport size={14} />, onClick: () => setArrivalOpen(true) },
            { label: '入荷予定日変更', icon: <IconCalendarStats size={14} />, onClick: () => setRescheduleOpen(true) },
            { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', divider: true, onClick: () => setCancelOpen(true) },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="外注先" value={ORDER.supplierName} />
        <FieldValue label="工程" value={ORDER.stepName} />
        <FieldValue label="指示書" value={<DocNumber c="blue">#{ORDER.workOrderNumber}</DocNumber>} />
        <FieldValue label="依頼日" value={formatDate(ORDER.requestedAt)} />
        <FieldValue label="入荷予定日" value={formatDate(ORDER.expectedAt)} />
        <FieldValue label="入荷日" value={ORDER.receivedAt ? formatDate(ORDER.receivedAt) : '未入荷'} />
        <FieldValue label="備考" value={ORDER.notes} />
      </SummaryGrid>

      <Tabs defaultValue="related">
        <Tabs.List>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="sm">
            <Group>
              <Text size="sm" c="dimmed" w={120}>指示書</Text>
              <DocNumber c="blue">#{ORDER.workOrderNumber}</DocNumber>
            </Group>
            <Divider />
            <Group>
              <Text size="sm" c="dimmed" w={120}>製品</Text>
              <Text size="sm">{ORDER.productName}</Text>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <RecordArrivalModal opened={arrivalOpen} onClose={() => setArrivalOpen(false)} label={label} />
      <CancelOutsourceOrderModal opened={cancelOpen} onClose={() => setCancelOpen(false)} label={label} />
      <RescheduleOutsourceOrderModal
        opened={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        label={label}
        currentExpectedAt={ORDER.expectedAt}
      />
    </DetailShell>
  );
}
