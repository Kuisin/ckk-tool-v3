'use client';

import { useTransition } from 'react';
import {
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconMinus, IconPlus, IconRuler2, IconUpload } from '@tabler/icons-react';
import { z } from 'zod';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { MATERIALS, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const productSchema = z.object({
  code: z.string().optional(),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  materialId: z.string().nullable(),
  unit: z.string().min(1, '単位を選択してください'),
  isActive: z.boolean(),
  notes: z.string().optional(),
  // spec is a free-structure JSON → edited as key/value rows
  spec: z.array(z.object({ key: z.string(), value: z.string() })),
});

type FormValues = z.infer<typeof productSchema>;

export default function ProductNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(productSchema),
    initialValues: {
      code: '',
      nameJa: '',
      nameEn: '',
      materialId: null,
      unit: '本',
      isActive: true,
      notes: '',
      spec: [{ key: '', value: '' }],
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '製品を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '製品', '新規作成']}
      title="製品 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="製品コード"
            placeholder="保存時に自動採番"
            description="形式: PRD-YYYYMM-NNNN（自動採番）"
            disabled
            {...form.getInputProps('code')}
          />
          <Select
            label="素材" placeholder="素材を選択" data={MATERIALS} searchable clearable
            {...form.getInputProps('materialId')}
          />
          <Select label="単位" data={UNITS} withAsterisk {...form.getInputProps('unit')} />
          <Switch label="有効" mt={isMobile ? 0 : 'xl'} {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </SimpleGrid>
        <Stack gap="sm" mt="sm">
          <LocalizedTextInput
            label="名称"
            required
            jaProps={form.getInputProps('nameJa')}
            enProps={form.getInputProps('nameEn')}
          />
        </Stack>
        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="仕様" description="項目名と値の組み合わせで自由に記述できます（spec JSON）。">
        <Stack gap="xs">
          {form.values.spec.map((_, index) => (
            <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
              <TextInput
                placeholder="項目名（例: 外径）" style={{ flex: 1 }}
                {...form.getInputProps(`spec.${index}.key`)}
              />
              <TextInput
                placeholder="値（例: φ20 ±0.01）" style={{ flex: 1 }}
                {...form.getInputProps(`spec.${index}.value`)}
              />
              <Button
                variant="subtle" color="red" px={6} disabled={form.values.spec.length === 1}
                onClick={() => form.removeListItem('spec', index)} aria-label="この項目を削除"
              >
                <IconMinus size={14} />
              </Button>
            </Group>
          ))}
        </Stack>
        <Button
          variant="subtle" leftSection={<IconPlus size={14} />} mt="sm" size="sm" fullWidth={isMobile}
          onClick={() => form.insertListItem('spec', { key: '', value: '' })}
        >
          仕様項目を追加
        </Button>
      </FormSection>

      <FormSection title="設計図">
        <Paper withBorder radius="md" p="lg" style={{ borderStyle: 'dashed', cursor: 'pointer' }}>
          <Stack align="center" gap="xs">
            <ThemeIcon variant="light" color="gray" size="xl" radius="md">
              <IconUpload size={24} />
            </ThemeIcon>
            <Text size="sm" c="dimmed">設計図ファイルをドラッグまたはクリックしてアップロード</Text>
            <Group gap={6} c="dimmed">
              <IconRuler2 size={14} />
              <Text size="xs" c="dimmed">PDF / DWG / 画像（最新版が design_file として登録）</Text>
            </Group>
          </Stack>
        </Paper>
      </FormSection>
    </FormShell>
  );
}
