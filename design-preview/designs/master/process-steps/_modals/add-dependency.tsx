/**
 * add-dependency.tsx — 依存追加ポップアップ
 *   process_step_use_dependencies / process_step_exec_dependencies
 *
 * Controlled FormModal opened from the process-step detail 使用依存 / 実行依存 tabs.
 * 種別（使用依存 / 実行依存）・依存工程・関係（AND/OR）・排他 を指定。
 * Uses the unified FormModal scaffold (lib/modals) + zodResolver (lib/form).
 */

import { useEffect, useTransition } from 'react';
import { SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { PROCESS_STEPS } from '../../../lib/mock';

type DependencyKind = 'use' | 'exec';

const dependencySchema = z.object({
  kind: z.enum(['use', 'exec']),
  dependsOnStepId: z.string().min(1, '依存工程を選択してください'),
  relation: z.enum(['AND', 'OR']),
  isNegation: z.boolean(),
});

type DependencyFormValues = z.infer<typeof dependencySchema>;

const RELATION_OPTIONS = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];

export function AddDependencyModal({
  opened,
  onClose,
  defaultKind = 'use',
}: ModalBaseProps & { defaultKind?: DependencyKind }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm<DependencyFormValues>({
    validate: zodResolver(dependencySchema),
    initialValues: {
      kind: defaultKind,
      dependsOnStepId: '',
      relation: 'AND',
      isNegation: false,
    },
  });

  // Reflect the tab the user opened from each time the modal opens.
  useEffect(() => {
    if (opened) form.setFieldValue('kind', defaultKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, defaultKind]);

  const isUse = form.values.kind === 'use';

  const handleSubmit = (values: DependencyFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting dependency:', values);
        notifications.show({
          title: '保存しました',
          message: isUse ? '使用依存を追加しました' : '実行依存を追加しました',
          color: 'green',
        });
        form.reset();
        onClose();
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="依存の追加"
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="追加"
      loading={isPending}
      size="md"
    >
      <Stack gap={4}>
        <Text size="xs" c="dimmed">種別</Text>
        <SegmentedControl
          fullWidth
          data={[
            { value: 'use', label: '使用依存' },
            { value: 'exec', label: '実行依存' },
          ]}
          value={form.values.kind}
          onChange={(v) => form.setFieldValue('kind', v as DependencyKind)}
        />
        <Text size="xs" c="dimmed" mt={4}>
          {isUse
            ? '使用依存＝ワークフローに含めてよい条件。'
            : '実行依存＝この工程を開始してよい条件（前工程の完了）。'}
        </Text>
      </Stack>

      <Select
        label="依存工程"
        placeholder="工程を選択"
        data={PROCESS_STEPS}
        searchable
        withAsterisk
        {...form.getInputProps('dependsOnStepId')}
      />

      <Select label="関係" data={RELATION_OPTIONS} {...form.getInputProps('relation')} />

      {isUse && (
        <Switch
          label="排他条件（! 否定）"
          description="この工程を含む場合は依存工程を含めないこと"
          {...form.getInputProps('isNegation', { type: 'checkbox' })}
        />
      )}
    </FormModal>
  );
}
