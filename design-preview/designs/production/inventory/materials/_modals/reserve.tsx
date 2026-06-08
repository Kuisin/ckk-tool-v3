/**
 * reserve.tsx — 素材在庫 引当予約ポップアップ（inventory_reservations: RESERVED）
 *
 * Controlled FormModal: 指示書を指定して素材在庫を予約する。
 * Built on the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useTransition } from 'react';
import { NumberInput, Select, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../../lib/modals';
import { zodResolver } from '../../../../lib/form';

const WORK_ORDERS = [
  { value: 'wo-1042', label: '指示書 #1042 — 精密軸 PRD-2601-0001' },
  { value: 'wo-1051', label: '指示書 #1051 — 特殊加工品 PRD-2603-0012' },
];

export function ReserveMaterialModal({
  opened,
  onClose,
  label,
  available,
  unit,
}: ModalBaseProps & { label: string; available: number; unit: string }) {
  const [isPending, startTransition] = useTransition();

  const schema = z.object({
    workOrderId: z.string().min(1, '指示書を選択してください'),
    quantity: z
      .number()
      .min(0.001, '数量を入力してください')
      .max(available, `引当可能数（${available} ${unit}）を超えています`),
  });
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { workOrderId: '', quantity: 1 },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('Reserve material:', values);
      notifications.show({ title: '予約しました', message: '素材在庫を引当予約しました', color: 'green' });
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
      <Select label="指示書" placeholder="指示書を選択" data={WORK_ORDERS} searchable withAsterisk {...form.getInputProps('workOrderId')} />
      <NumberInput label="予約数量" withAsterisk min={0} decimalScale={3} max={available} suffix={` ${unit}`} {...form.getInputProps('quantity')} />
    </FormModal>
  );
}
