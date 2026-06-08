'use client';

import { useTransition } from 'react';
import { NumberInput, Select, SimpleGrid, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell } from '../../lib/shells';
import { MATERIALS, SUPPLIERS, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

// ── Zod schema ───────────────────────────────────────────────────────────────
const receiptSchema = z.object({
  materialId: z.string().min(1, '素材を選択してください'),
  supplierId: z.string().nullable(),
  quantity: z.number().min(0.001, '数量を入力してください'),
  unit: z.string().min(1, '単位を選択してください'),
  receivedAt: z.date().nullable(),
  notes: z.string().optional(),
});

type ReceiptFormValues = z.infer<typeof receiptSchema>;

export default function MaterialReceiptNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ReceiptFormValues>({
    validate: zodResolver(receiptSchema),
    initialValues: {
      materialId: '',
      supplierId: null,
      quantity: 1,
      unit: '本',
      receivedAt: null,
      notes: '',
    },
  });

  const handleSubmit = (values: ReceiptFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '素材入荷を登録しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', '購買', '素材入荷', '素材入荷登録']}
      title="素材入荷登録"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="入荷情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="素材" placeholder="素材を選択" data={MATERIALS} searchable withAsterisk {...form.getInputProps('materialId')} />
          <Select label="仕入先" placeholder="仕入先を選択" data={SUPPLIERS} searchable clearable {...form.getInputProps('supplierId')} />
          <NumberInput label="数量" placeholder="数量" min={0} decimalScale={3} thousandSeparator="," withAsterisk {...form.getInputProps('quantity')} />
          <Select label="単位" placeholder="単位を選択" data={UNITS} withAsterisk {...form.getInputProps('unit')} />
          <DatePickerInput
            label="入荷日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable withAsterisk {...form.getInputProps('receivedAt')}
          />
        </SimpleGrid>
        <Textarea label="備考" placeholder="ロット・検収メモなど" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>
    </FormShell>
  );
}
