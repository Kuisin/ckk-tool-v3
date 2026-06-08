/**
 * duplicate.tsx — 検査表テンプレート複製ポップアップ
 *
 * Controlled modal: copy an existing template into a new one (new code + name).
 * Built on the unified FormModal scaffold (lib/modals) with @mantine/form +
 * zodResolver (lib/form).
 */

import { useForm } from '@mantine/form';
import { Text, TextInput } from '@mantine/core';
import { z } from 'zod';
import { FormModal, type ModalBaseProps } from '../../../lib/modals';
import { zodResolver } from '../../../lib/form';
import { LocalizedTextInput } from '../../../lib/shells';

const duplicateSchema = z.object({
  code: z.string().min(1, 'コードを入力してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
});

type DuplicateValues = z.infer<typeof duplicateSchema>;

export function DuplicateTemplateModal({
  opened,
  onClose,
  sourceCode,
  sourceName,
}: ModalBaseProps & {
  sourceCode: string;
  sourceName?: { ja: string; en: string };
}) {
  const form = useForm<DuplicateValues>({
    validate: zodResolver(duplicateSchema),
    initialValues: {
      code: '',
      nameJa: sourceName ? `${sourceName.ja}（コピー）` : '',
      nameEn: sourceName ? `${sourceName.en} (Copy)` : '',
    },
  });

  const handleSubmit = (values: DuplicateValues) => {
    console.log('Duplicate template from', sourceCode, '→', values);
    form.reset();
    onClose();
  };

  return (
    <FormModal
      opened={opened}
      onClose={onClose}
      title="検査表テンプレートの複製"
      submitLabel="複製"
      size="md"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <Text size="sm" c="dimmed">
        「{sourceCode}」の検査項目を引き継いで新しいテンプレートを作成します。
      </Text>
      <TextInput
        label="コード"
        placeholder="INSP-CYL-002"
        withAsterisk
        {...form.getInputProps('code')}
      />
      <LocalizedTextInput
        label="名称"
        required
        jaProps={form.getInputProps('nameJa')}
        enProps={form.getInputProps('nameEn')}
      />
    </FormModal>
  );
}
