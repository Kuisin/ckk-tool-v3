'use client';

import { useState, useTransition } from 'react';
import {
  Anchor,
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
import { IconFileTypePdf, IconMinus, IconPlus, IconUpload } from '@tabler/icons-react';
import { z } from 'zod';
import { ActiveBadge, DocNumber } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { MATERIALS, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import { ReplaceDesignModal } from './_modals/replace-design';

const productSchema = z.object({
  code: z.string().optional(),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  materialId: z.string().nullable(),
  unit: z.string().min(1, '単位を選択してください'),
  isActive: z.boolean(),
  notes: z.string().optional(),
  spec: z.array(z.object({ key: z.string(), value: z.string() })),
});

type FormValues = z.infer<typeof productSchema>;

const DESIGN_FILE = { name: '精密軸_設計図_v3.pdf', version: 3 };

export default function ProductEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [replaceOpen, setReplaceOpen] = useState(false);

  const form = useForm<FormValues>({
    validate: zodResolver(productSchema),
    initialValues: {
      code: 'PRD-202601-0001',
      nameJa: '精密軸',
      nameEn: 'Precision shaft',
      materialId: 'A01A0001-A001-001',
      unit: '本',
      isActive: true,
      notes: '主力製品。公差厳しめ。',
      spec: [
        { key: '外径', value: 'φ20 ±0.01' },
        { key: '全長', value: '300mm ±0.1' },
        { key: '表面粗さ', value: 'Ra 0.4' },
      ],
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '製品を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '製品', form.values.code ?? '', '編集']}
      title="製品 編集"
      status={<ActiveBadge active={form.values.isActive} />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput
            label="製品コード" description="採番済みコードは変更できません" disabled
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
        <Textarea label="備考" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="仕様" description="項目名と値の組み合わせで自由に記述できます（spec JSON）。">
        <Stack gap="xs">
          {form.values.spec.map((_, index) => (
            <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
              <TextInput placeholder="項目名（例: 外径）" style={{ flex: 1 }} {...form.getInputProps(`spec.${index}.key`)} />
              <TextInput placeholder="値（例: φ20 ±0.01）" style={{ flex: 1 }} {...form.getInputProps(`spec.${index}.value`)} />
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
        <Group justify="space-between" wrap="nowrap" mb="md">
          <Group gap="xs">
            <ThemeIcon variant="light" color="red" size="md" radius="sm">
              <IconFileTypePdf size={18} />
            </ThemeIcon>
            <Stack gap={0}>
              <Anchor size="sm">{DESIGN_FILE.name}</Anchor>
              <Text size="xs" c="dimmed">現在の設計図（最新版 v{DESIGN_FILE.version}）</Text>
            </Stack>
          </Group>
          <DocNumber c="dimmed">v{DESIGN_FILE.version}</DocNumber>
        </Group>
        <Button variant="default" leftSection={<IconUpload size={14} />} onClick={() => setReplaceOpen(true)}>
          設計図を差し替え
        </Button>
      </FormSection>

      <ReplaceDesignModal
        opened={replaceOpen}
        onClose={() => setReplaceOpen(false)}
        productCode={form.values.code ?? ''}
        currentFileName={DESIGN_FILE.name}
        currentVersion={DESIGN_FILE.version}
      />
    </FormShell>
  );
}
