/**
 * record-defect.tsx — 不良記録ポップアップ
 *
 * Opened from the step execution page. Records a defect type + description.
 * Built on FormModal (lib/modals).
 */

import { useTransition } from 'react';
import { Select, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { zodResolver } from '../../../lib/form';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { DEFECT_TYPES } from '../../../lib/mock';

const schema = z.object({
  defectTypeId: z.string().min(1, '不良種類を選択してください'),
  description: z.string().min(1, '詳細を入力してください'),
});

type Values = z.infer<typeof schema>;

export function RecordDefectModal({
  opened,
  onClose,
  stepName,
}: ModalBaseProps & { stepName: string }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<Values>({
    validate: zodResolver(schema),
    initialValues: { defectTypeId: '', description: '' },
  });

  const handleSubmit = (values: Values) => {
    startTransition(async () => {
      console.log('defect record', stepName, values);
      notifications.show({ title: '記録しました', message: '不良記録を保存しました', color: 'green' });
      form.reset();
      onClose();
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title={`不良記録 — ${stepName}`}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="記録"
      loading={isPending}
      size="md"
    >
      <Select label="不良種類" placeholder="不良種類を選択" data={DEFECT_TYPES} searchable withAsterisk {...form.getInputProps('defectTypeId')} />
      <Textarea label="詳細" placeholder="不良の詳細を入力してください" rows={4} withAsterisk {...form.getInputProps('description')} />
    </FormModal>
  );
}
