'use client';

import { useTransition } from 'react';
import { Select, SimpleGrid, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell } from '../../lib/shells';
import { StatusBadge } from '../../lib/status';
import { SUPPLIERS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const WORK_ORDERS = [
  { value: 'wo-1042', label: '指示書 #1042 — 精密軸 PRD-2601-0001' },
  { value: 'wo-1051', label: '指示書 #1051 — 特殊加工品 PRD-2603-0012' },
  { value: 'wo-1029', label: '指示書 #1029 — ロッド PRD-2602-0008' },
];

const OUTSOURCE_STEPS = [
  { value: 'CENTERLESS', label: 'センタレス' },
  { value: 'COATING', label: 'コーティング' },
];

const outsourceSchema = z.object({
  workOrderId: z.string().min(1, '指示書を選択してください'),
  stepId: z.string().min(1, '工程を選択してください'),
  supplierId: z.string().min(1, '外注先を選択してください'),
  requestedAt: z.date().nullable(),
  expectedAt: z.date().nullable(),
  receivedAt: z.date().nullable(),
  notes: z.string().optional(),
});

type OutsourceFormValues = z.infer<typeof outsourceSchema>;

export default function OutsourceOrderEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  // 既存データのプリフィル
  const form = useForm<OutsourceFormValues>({
    validate: zodResolver(outsourceSchema),
    initialValues: {
      workOrderId: 'wo-1042',
      stepId: 'CENTERLESS',
      supplierId: 'sp-001',
      requestedAt: new Date('2026-05-26'),
      expectedAt: new Date('2026-06-02'),
      receivedAt: null,
      notes: 'φ20 → φ19.98 仕上げ。RA0.4 以下。',
    },
  });

  const handleSubmit = (values: OutsourceFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '外注依頼を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', '購買', '外注依頼', '編集']}
      title="外注依頼 編集"
      status={<StatusBadge entity="Step" status="IN_PROGRESS" />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="依頼情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="指示書" placeholder="指示書を選択" data={WORK_ORDERS} searchable withAsterisk {...form.getInputProps('workOrderId')} />
          <Select label="工程" placeholder="工程を選択" data={OUTSOURCE_STEPS} withAsterisk {...form.getInputProps('stepId')} />
          <Select label="外注先" placeholder="外注先を選択" data={SUPPLIERS} searchable withAsterisk {...form.getInputProps('supplierId')} />
          <DatePickerInput
            label="依頼日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('requestedAt')}
          />
          <DatePickerInput
            label="入荷予定日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('expectedAt')}
          />
          <DatePickerInput
            label="入荷日" placeholder="入荷時に記録" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('receivedAt')}
          />
        </SimpleGrid>
        <Textarea label="備考" placeholder="加工仕様・注意事項など" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>
    </FormShell>
  );
}
