/**
 * reschedule.tsx — 外注依頼 入荷予定日変更ポップアップ
 *
 * Controlled FormModal: 入荷予定日を変更し理由を記録する。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { Text, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { formatDate } from '../../../lib/ui';

const schema = z.object({
  expectedAt: z.date({ message: '入荷予定日を選択してください' }),
  reason: z.string().min(1, '変更理由を入力してください'),
});

type Values = z.infer<typeof schema>;

export function RescheduleOutsourceOrderModal({
  opened,
  onClose,
  label,
  currentExpectedAt,
}: ModalBaseProps & { label: string; currentExpectedAt: string | null }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: {
      expectedAt: (currentExpectedAt ? new Date(currentExpectedAt) : new Date()) as Date,
      reason: '',
    },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Reschedule outsource order:', values);
      notifications.show({ title: '変更しました', message: '入荷予定日を変更しました', color: 'green' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="入荷予定日変更"
      submitLabel="変更する"
      loading={isPending}
      size="sm"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="xs" c="dimmed">現在の入荷予定日: {formatDate(currentExpectedAt)}</Text>
      <DatePickerInput
        label="新しい入荷予定日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD" withAsterisk {...form.getInputProps('expectedAt')}
      />
      <Textarea label="変更理由" placeholder="納期遅延・先方都合など" withAsterisk rows={2} {...form.getInputProps('reason')} />
    </FormModal>
  );
}
