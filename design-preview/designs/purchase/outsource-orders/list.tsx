'use client';

import { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import {
  IconCalendarStats,
  IconPackageImport,
  IconSearch,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react';
import { DocNumber, formatDate, NewButton } from '../../lib/ui';
import { StatusBadge, statusOptions } from '../../lib/status';
import { DataTable, type Column } from '../../lib/data-table';
import { ListShell } from '../../lib/shells';
import { SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { RecordArrivalModal } from './_modals/record-arrival';
import { CancelOutsourceOrderModal } from './_modals/cancel';
import { RescheduleOutsourceOrderModal } from './_modals/reschedule';

// 外注可能工程（PROCESS_EXECUTION = INTERNAL_OR_OUTSOURCE のサブセット）
const OUTSOURCE_STEPS = [
  { value: 'CENTERLESS', label: 'センタレス' },
  { value: 'COATING', label: 'コーティング' },
];

// ── Mock data ───────────────────────────────────────────────────────────────
interface OutsourceOrderRow {
  id: string;
  supplierName: string;
  stepName: string;
  stepCode: string;
  workOrderNumber: number;
  requestedAt: string;
  expectedAt: string;
  receivedAt: string | null;
  status: string;
}

const MOCK_RECORDS: OutsourceOrderRow[] = [
  { id: '1', supplierName: '外注研磨株式会社', stepName: 'センタレス', stepCode: 'CENTERLESS', workOrderNumber: 1042, requestedAt: '2026-05-26', expectedAt: '2026-06-02', receivedAt: null, status: 'IN_PROGRESS' },
  { id: '2', supplierName: '中央コーティング工業', stepName: 'コーティング', stepCode: 'COATING', workOrderNumber: 1029, requestedAt: '2026-05-18', expectedAt: '2026-05-25', receivedAt: '2026-05-24', status: 'COMPLETED' },
  { id: '3', supplierName: '外注研磨株式会社', stepName: 'センタレス', stepCode: 'CENTERLESS', workOrderNumber: 1051, requestedAt: '2026-06-01', expectedAt: '2026-06-08', receivedAt: null, status: 'PENDING' },
  { id: '4', supplierName: '中央コーティング工業', stepName: 'コーティング', stepCode: 'COATING', workOrderNumber: 1004, requestedAt: '2026-04-20', expectedAt: '2026-04-28', receivedAt: null, status: 'CANCELLED' },
];

const isOpen = (s: string) => s === 'PENDING' || s === 'IN_PROGRESS';

export default function OutsourceOrdersListPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const [arrivalTarget, setArrivalTarget] = useState<OutsourceOrderRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OutsourceOrderRow | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<OutsourceOrderRow | null>(null);

  const reset = () => {
    setSearch('');
    setSupplierFilter(null);
    setStepFilter(null);
    setStatusFilter(null);
  };

  const filtered = MOCK_RECORDS.filter((r) => {
    const matchesSearch =
      !search ||
      r.supplierName.includes(search) ||
      r.stepName.includes(search) ||
      String(r.workOrderNumber).includes(search);
    const matchesSupplier = !supplierFilter || r.supplierName === supplierFilter;
    const matchesStep = !stepFilter || r.stepCode === stepFilter;
    const matchesStatus = !statusFilter || r.status === statusFilter;
    return matchesSearch && matchesSupplier && matchesStep && matchesStatus;
  });

  const supplierOptions = SUPPLIERS.map((s) => ({ value: s.label, label: s.label }));

  const labelOf = (r: OutsourceOrderRow) => `${r.supplierName} — ${r.stepName}（指示書 #${r.workOrderNumber}）`;

  const columns: Column<OutsourceOrderRow>[] = [
    { key: 'supplierName', header: '外注先', sortable: true, render: (r) => r.supplierName },
    { key: 'stepName', header: '工程', sortable: true, width: 130, render: (r) => r.stepName },
    { key: 'workOrderNumber', header: '指示書番号', sortable: true, width: 120, sortValue: (r) => r.workOrderNumber, render: (r) => <DocNumber>#{r.workOrderNumber}</DocNumber> },
    { key: 'requestedAt', header: '依頼日', sortable: true, hideable: true, width: 120, render: (r) => formatDate(r.requestedAt) },
    { key: 'expectedAt', header: '入荷予定日', sortable: true, width: 120, render: (r) => formatDate(r.expectedAt) },
    { key: 'receivedAt', header: '入荷日', sortable: true, hideable: true, width: 120, sortValue: (r) => r.receivedAt ?? '', render: (r) => formatDate(r.receivedAt) },
    { key: 'status', header: '状態', sortable: true, width: 110, render: (r) => <StatusBadge entity="Step" status={r.status} /> },
  ];

  return (
    <>
      <ListShell
        breadcrumbs={['ホーム', '購買', '外注依頼']}
        title="外注依頼"
        action={<NewButton label="外注依頼登録" />}
        onReset={reset}
        search={
          <TextInput
            placeholder="外注先・工程・指示書番号で検索"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
        }
        filters={
          <>
            <Select
              placeholder="外注先" data={supplierOptions} value={supplierFilter} onChange={setSupplierFilter}
              searchable clearable w={isMobile ? undefined : 200} style={isMobile ? { flex: 1 } : undefined}
            />
            <Select
              placeholder="工程" data={OUTSOURCE_STEPS} value={stepFilter} onChange={setStepFilter}
              clearable w={isMobile ? undefined : 150} style={isMobile ? { flex: 1 } : undefined}
            />
            <Select
              placeholder="状態" data={statusOptions('Step')} value={statusFilter} onChange={setStatusFilter}
              clearable w={isMobile ? undefined : 140} style={isMobile ? { flex: 1 } : undefined}
            />
          </>
        }
      >
        <DataTable
          data={filtered}
          columns={columns}
          getRowId={(r) => r.id}
          onRowClick={() => { /* navigate to detail */ }}
          defaultSort={{ key: 'expectedAt', dir: 'asc' }}
          selectable
          bulkActions={[
            { label: '一括入荷記録', icon: <IconPackageImport size={16} />, color: 'blue', onAction: (rows) => setArrivalTarget(rows[0]) },
          ]}
          rowActions={(r) => [
            ...(isOpen(r.status)
              ? [
                  { label: '入荷を記録', icon: <IconPackageImport size={14} />, onAction: () => setArrivalTarget(r) },
                  { label: '入荷予定日変更', icon: <IconCalendarStats size={14} />, onAction: () => setRescheduleTarget(r) },
                  { label: 'キャンセル', icon: <IconX size={14} />, color: 'red', onAction: () => setCancelTarget(r) },
                ]
              : []),
          ]}
          emptyIcon={<IconTruckDelivery size={24} />}
          emptyMessage="外注依頼がありません"
          emptyAction={<NewButton label="外注依頼登録" />}
        />
      </ListShell>

      <RecordArrivalModal
        opened={!!arrivalTarget}
        onClose={() => setArrivalTarget(null)}
        label={arrivalTarget ? labelOf(arrivalTarget) : ''}
      />
      <CancelOutsourceOrderModal
        opened={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        label={cancelTarget ? labelOf(cancelTarget) : ''}
      />
      <RescheduleOutsourceOrderModal
        opened={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        label={rescheduleTarget ? labelOf(rescheduleTarget) : ''}
        currentExpectedAt={rescheduleTarget?.expectedAt ?? null}
      />
    </>
  );
}
