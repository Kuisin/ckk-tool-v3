/**
 * approve.tsx — 承認ポップアップ（コメント）
 *
 * Controlled form modal opened from the approval detail action panel.
 * Comment optional; submit button is green. Built on FormModal (lib/modals).
 */

import { useTransition } from 'react';
import { Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

export function ApproveModal({
  opened,
  onClose,
  workOrderNumber,
  stepLabel,
}: ModalBaseProps & { workOrderNumber: number; stepLabel: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm({ initialValues: { comment: '' } });

  const handleSubmit = (values: { comment: string }) => {
    startTransition(async () => {
      console.log('approve', workOrderNumber, values);
      notifications.show({ title: '承認しました', message: `${stepLabel}を承認しました`, color: 'green' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`${stepLabel}の承認 — 指示書 #${workOrderNumber}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="承認"
      loading={isPending}
      size="md"
    >
      <Text size="sm">指示書 #{workOrderNumber} の{stepLabel}を承認します。</Text>
      <Textarea label="コメント" placeholder="承認コメント（任意）" rows={3} {...form.getInputProps('comment')} />
    </FormModal>
  );
}
