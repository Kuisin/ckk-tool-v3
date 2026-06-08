/**
 * record-arrival.tsx — 外注依頼 入荷を記録ポップアップ（外注工程の入荷登録）
 *
 * Controlled FormModal: 入荷日 と 入荷数量 を入力して外注工程の入荷を記録する。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { NumberInput, Text, Textarea } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';

const schema = z.object({
  receivedAt: z.date({ message: '入荷日を選択してください' }),
  quantity: z.number().min(1, '入荷数量を入力してください'),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function RecordArrivalModal({
  opened,
  onClose,
  label,
  unit = '本',
}: ModalBaseProps & { label: string; unit?: string }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { receivedAt: new Date() as Date, quantity: 1, notes: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Record arrival:', values);
      notifications.show({ title: '記録しました', message: '外注工程の入荷を記録しました', color: 'green' });
      form.reset();
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="入荷を記録"
      submitLabel="記録する"
      loading={isPending}
      size="sm"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Text size="sm" c="dimmed">{label}</Text>
      <DatePickerInput
        label="入荷日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD" withAsterisk {...form.getInputProps('receivedAt')}
      />
      <NumberInput label="入荷数量" withAsterisk min={1} suffix={` ${unit}`} {...form.getInputProps('quantity')} />
      <Textarea label="備考" placeholder="検収メモなど" rows={2} {...form.getInputProps('notes')} />
    </FormModal>
  );
}
