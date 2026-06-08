/**
 * complete-step.tsx — 工程完了ポップアップ（完了数量 / 担当者）
 *
 * Opened from the step execution page. Captures the completed quantity and the
 * operator before completing the step. Built on FormModal (lib/modals).
 */

import { useTransition } from 'react';
import { NumberInput, Select, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../../lib/form';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { USER_OPTIONS } from '../../../lib/mock';

const schema = z.object({
  completedQuantity: z.number().int().min(0, '0以上を入力してください'),
  operatorId: z.string().min(1, '担当者を選択してください'),
  notes: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function CompleteStepModal({
  opened,
  onClose,
  stepName,
  plannedQuantity,
}: ModalBaseProps & { stepName: string; plannedQuantity: number }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { completedQuantity: plannedQuantity, operatorId: '', notes: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('complete step', stepName, values);
      notifications.show({ title: '完了しました', message: `「${stepName}」を完了しました`, color: 'green' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`工程完了 — ${stepName}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="完了"
      loading={isPending}
      size="md"
    >
      <NumberInput label="完了数量" min={0} suffix=" 本" withAsterisk {...form.getInputProps('completedQuantity')} />
      <Select label="担当者" placeholder="担当者を選択" data={USER_OPTIONS} searchable withAsterisk {...form.getInputProps('operatorId')} />
      <Textarea label="備考" placeholder="特記事項（任意）" rows={3} {...form.getInputProps('notes')} />
    </FormModal>
  );
}
