/**
 * quick-receipt.tsx — クイック入荷登録ポップアップ（素材入荷の簡易登録）
 *
 * Controlled FormModal: 素材・数量・入荷日のみで素材入荷を即時登録する軽量フロー。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { NumberInput, Select, SimpleGrid } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { MATERIALS, SUPPLIERS, UNITS } from '../../../lib/mock';

const schema = z.object({
  materialId: z.string().min(1, '素材を選択してください'),
  supplierId: z.string().nullable(),
  quantity: z.number().min(0.001, '数量を入力してください'),
  unit: z.string().min(1, '単位を選択してください'),
  receivedAt: z.date().nullable(),
});

type Values = z.infer<typeof schema>;

export function QuickReceiptModal({ opened, onClose }: ModalBaseProps) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { materialId: '', supplierId: null, quantity: 1, unit: '本', receivedAt: new Date() },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Quick receipt:', values);
      notifications.show({ title: '保存しました', message: '素材入荷を登録しました', color: 'green' });
      form.reset();
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="クイック入荷登録"
      submitLabel="登録する"
      loading={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Select label="素材" placeholder="素材を選択" data={MATERIALS} searchable withAsterisk {...form.getInputProps('materialId')} />
      <Select label="仕入先" placeholder="仕入先を選択" data={SUPPLIERS} searchable clearable {...form.getInputProps('supplierId')} />
      <SimpleGrid cols={2} spacing="sm">
        <NumberInput label="数量" min={0} decimalScale={3} thousandSeparator="," withAsterisk {...form.getInputProps('quantity')} />
        <Select label="単位" placeholder="単位を選択" data={UNITS} withAsterisk {...form.getInputProps('unit')} />
      </SimpleGrid>
      <DatePickerInput
        label="入荷日" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
        valueFormat="YYYY/MM/DD" clearable withAsterisk {...form.getInputProps('receivedAt')}
      />
    </FormModal>
  );
}
