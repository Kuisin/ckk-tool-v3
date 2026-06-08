/**
 * reject.tsx — 差し戻しポップアップ（理由）
 *
 * Controlled form modal opened from the approval detail action panel.
 * Reason required. Built on FormModal (lib/modals) with a destructive alert.
 */

import { useTransition } from 'react';
import { Alert, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { z } from 'zod';
import { zodResolver } from '../../../lib/form';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

const schema = z.object({
  reason: z.string().min(1, '差し戻しの理由を入力してください'),
});

type Values = z.infer<typeof schema>;

export function RejectModal({
  opened,
  onClose,
  workOrderNumber,
  stepLabel,
}: ModalBaseProps & { workOrderNumber: number; stepLabel: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { reason: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('reject', workOrderNumber, values);
      notifications.show({ title: '差し戻しました', message: `${stepLabel}を差し戻しました`, color: 'red' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`${stepLabel}の差し戻し — 指示書 #${workOrderNumber}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="差し戻し"
      loading={isPending}
      size="md"
    >
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
        差し戻すと依頼者に通知され、指示書は承認前の状態に戻ります。
      </Alert>
      <Textarea label="差し戻し理由" placeholder="理由を入力してください" rows={4} withAsterisk {...form.getInputProps('reason')} />
    </FormModal>
  );
}
