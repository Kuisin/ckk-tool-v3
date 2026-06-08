/**
 * request-change-approval.tsx — 変更承認依頼ポップアップ（製造ワークフロー変更承認）
 *
 * Controlled form modal opened from the WorkOrderStepsPanel. Requires a reason.
 * Built on the unified FormModal scaffold (lib/modals).
 */

import { useTransition } from 'react';
import { Select, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../../lib/form';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';

const schema = z.object({
  group: z.string().min(1, '承認グループを選択してください'),
  reason: z.string().min(1, '変更理由を入力してください'),
});

type Values = z.infer<typeof schema>;

const GROUP_OPTIONS = [
  { value: 'wf-change', label: 'ワークフロー変更承認グループ' },
];

export function RequestChangeApprovalModal({
  opened,
  onClose,
  workOrderNumber,
}: ModalBaseProps & { workOrderNumber: number }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { group: 'wf-change', reason: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('change approval request', workOrderNumber, values);
      notifications.show({ title: '依頼しました', message: '変更承認を依頼しました', color: 'green' });
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`変更承認依頼 — 指示書 #${workOrderNumber}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="依頼"
      loading={isPending}
      size="md"
    >
      <Select label="承認グループ" data={GROUP_OPTIONS} withAsterisk {...form.getInputProps('group')} />
      <Textarea
        label="変更理由"
        placeholder="工程ワークフローの変更理由を入力してください"
        rows={4}
        withAsterisk
        {...form.getInputProps('reason')}
      />
    </FormModal>
  );
}
