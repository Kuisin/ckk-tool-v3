/**
 * add-delegate.tsx — 代理設定追加ポップアップ（quick-create）
 *
 * Controlled modal opened from the 代理設定 tab on the group detail page.
 * Built on the unified FormModal scaffold (lib/modals) with @mantine/form +
 * zodResolver (lib/form). Captures 原承認者 / 代理者 / 期間 / 理由.
 */

import { useForm } from '@mantine/form';
import { Select, SimpleGrid, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { USER_OPTIONS } from '../../../lib/mock';

const delegateSchema = z.object({
  delegatorId: z.string().min(1, '原承認者を選択してください'),
  delegateId: z.string().min(1, '代理者を選択してください'),
  validFrom: z.date({ message: '開始日を選択してください' }),
  validUntil: z.date({ message: '終了日を選択してください' }),
  reason: z.string().optional(),
});

type DelegateValues = z.infer<typeof delegateSchema>;

export function AddDelegateModal({ opened, onClose }: ModalBaseProps) {
  const form = useForm<DelegateValues>({
    validate: zodResolver(delegateSchema),
    initialValues: {
      delegatorId: '',
      delegateId: '',
      validFrom: null as unknown as Date,
      validUntil: null as unknown as Date,
      reason: '',
    },
  });

  const handleSubmit = (values: DelegateValues) => {
    console.log('Add delegate:', values);
    form.reset();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="代理設定の追加"
      submitLabel="追加"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <SimpleGrid cols={2} spacing="sm">
        <Select label="原承認者" placeholder="原承認者を選択" data={USER_OPTIONS} searchable withAsterisk {...form.getInputProps('delegatorId')} />
        <Select label="代理者" placeholder="代理者を選択" data={USER_OPTIONS} searchable withAsterisk {...form.getInputProps('delegateId')} />
        <DatePickerInput label="開始" placeholder="日付を選択" leftSection={<IconCalendar size={14} />} valueFormat="YYYY/MM/DD" withAsterisk clearable {...form.getInputProps('validFrom')} />
        <DatePickerInput label="終了" placeholder="日付を選択" leftSection={<IconCalendar size={14} />} valueFormat="YYYY/MM/DD" withAsterisk clearable {...form.getInputProps('validUntil')} />
      </SimpleGrid>
      <Textarea label="理由" placeholder="代理の理由" rows={2} {...form.getInputProps('reason')} />
    </FormModal>
  );
}
