/**
 * rollback-step.tsx — 工程キャンセル（巻き戻し）ポップアップ（破壊的 + 理由）
 *
 * Opened from the step execution page. Reverts an in-progress step to PENDING.
 * Requires a reason — uses FormModal with a red submit button (lib/modals).
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
  reason: z.string().min(1, '巻き戻しの理由を入力してください'),
});

type Values = z.infer<typeof schema>;

export function RollbackStepModal({
  opened,
  onClose,
  stepName,
}: ModalBaseProps & { stepName: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { reason: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('rollback step', stepName, values);
      notifications.show({ title: '巻き戻しました', message: `「${stepName}」を未着手に戻しました`, color: 'red' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`キャンセル（巻き戻し） — ${stepName}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="巻き戻す"
      loading={isPending}
      size="md"
    >
      <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
        この工程を未着手に戻します。入力済みの検査記録は破棄されます。この操作は取り消せません。
      </Alert>
      <Textarea label="巻き戻し理由" placeholder="理由を入力" rows={3} withAsterisk {...form.getInputProps('reason')} />
    </FormModal>
  );
}
