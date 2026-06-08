/**
 * reserve.tsx — 製品在庫 引当予約ポップアップ（inventory_reservations: RESERVED）
 *
 * Controlled FormModal: 受注書を指定して在庫を予約する。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { NumberInput, Select, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../../lib/modals';
import { zodResolver } from '../../../../lib/form';

const SALES_ORDERS = [
  { value: 'ORD-202606-00001-01', label: 'ORD-202606-00001-01 — 株式会社ABC製作所' },
  { value: 'ORD-202606-00002-01', label: 'ORD-202606-00002-01 — 合同会社XYZ工業' },
];

export function ReserveProductModal({
  opened,
  onClose,
  label,
  available,
  unit,
}: ModalBaseProps & { label: string; available: number; unit: string }) {
  const [isPending, startTransition] = useTransition();

  const schema = z.object({
    salesOrderId: z.string().min(1, '受注書を選択してください'),
    quantity: z
      .number()
      .min(1, '1以上を入力してください')
      .max(available, `引当可能数（${available} ${unit}）を超えています`),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { salesOrderId: '', quantity: 1 },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Reserve product:', values);
      notifications.show({ title: '予約しました', message: '製品在庫を引当予約しました', color: 'green' });
      form.reset();
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="引当予約"
      submitLabel="予約する"
      loading={isPending}
      size="sm"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="xs" c="dimmed">引当可能数: {available} {unit}</Text>
      <Select label="受注書" placeholder="受注書を選択" data={SALES_ORDERS} searchable withAsterisk {...form.getInputProps('salesOrderId')} />
      <NumberInput label="予約数量" withAsterisk min={1} max={available} suffix={` ${unit}`} {...form.getInputProps('quantity')} />
    </FormModal>
  );
}
