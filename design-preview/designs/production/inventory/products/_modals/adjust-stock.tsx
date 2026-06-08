/**
 * adjust-stock.tsx — 製品在庫 棚卸調整ポップアップ（inventory_transactions: ADJUST）
 *
 * Controlled FormModal: 調整後数量 と 理由 を入力して在庫を補正する。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { NumberInput, Select, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../../lib/modals';
import { zodResolver } from '../../../../lib/form';

const schema = z.object({
  quantity: z.number().min(0, '数量を入力してください'),
  reason: z.string().min(1, '理由を選択してください'),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

const REASONS = [
  { value: 'STOCKTAKE', label: '棚卸差異' },
  { value: 'DAMAGE', label: '破損・廃棄' },
  { value: 'CORRECTION', label: '登録誤り訂正' },
  { value: 'OTHER', label: 'その他' },
];

export function AdjustProductStockModal({
  opened,
  onClose,
  label,
  unit,
}: ModalBaseProps & { label: string; unit: string }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { quantity: 0, reason: '', notes: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Adjust product stock:', values);
      notifications.show({ title: '保存しました', message: '製品在庫を調整しました', color: 'green' });
      form.reset();
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="棚卸調整"
      submitLabel="調整を保存"
      loading={isPending}
      size="sm"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Text size="sm" c="dimmed">{label}</Text>
      <NumberInput label="調整後の在庫数" withAsterisk min={0} suffix={` ${unit}`} {...form.getInputProps('quantity')} />
      <Select label="理由" placeholder="理由を選択" data={REASONS} withAsterisk {...form.getInputProps('reason')} />
      <Textarea label="備考" placeholder="棚卸メモなど" rows={2} {...form.getInputProps('notes')} />
    </FormModal>
  );
}
