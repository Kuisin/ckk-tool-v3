'use client';

import { useTransition } from 'react';
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { ActiveBadge } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell, LocalizedTextInput } from '../../lib/shells';
import { PROCESS_STEPS, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const itemSchema = z.object({
  nameJa: z.string().min(1, '項目名（日本語）を入力してください'),
  nameEn: z.string().min(1, '項目名（英語）を入力してください'),
  unit: z.string().optional(),
  toleranceMin: z.number().nullable(),
  toleranceMax: z.number().nullable(),
  isRequired: z.boolean(),
  sortOrder: z.number().int(),
});

const templateSchema = z.object({
  code: z.string().min(1, 'コードを入力してください'),
  nameJa: z.string().min(1, '名称（日本語）を入力してください'),
  nameEn: z.string().min(1, '名称（英語）を入力してください'),
  relatedStepId: z.string().nullable(),
  isActive: z.boolean(),
  items: z.array(itemSchema).min(1, '検査項目を1件以上入力してください'),
});

type FormValues = z.infer<typeof templateSchema>;

const emptyItem = (sortOrder: number): FormValues['items'][number] => ({
  nameJa: '',
  nameEn: '',
  unit: '',
  toleranceMin: null,
  toleranceMax: null,
  isRequired: true,
  sortOrder,
});

// ── Prefilled mock (edit) ─────────────────────────────────────────────────────
const INITIAL: FormValues = {
  code: 'INSP-CYL-001',
  nameJa: '円筒加工 寸法検査表',
  nameEn: 'Cylinder Machining Dimension Inspection',
  relatedStepId: 'CYLINDER_INSPECTION',
  isActive: true,
  items: [
    { nameJa: '外径', nameEn: 'Outer Diameter', unit: 'mm', toleranceMin: 19.98, toleranceMax: 20.02, isRequired: true, sortOrder: 1 },
    { nameJa: '全長', nameEn: 'Total Length', unit: 'mm', toleranceMin: 2999.5, toleranceMax: 3000.5, isRequired: true, sortOrder: 2 },
    { nameJa: '真円度', nameEn: 'Roundness', unit: 'μm', toleranceMin: null, toleranceMax: 3, isRequired: true, sortOrder: 3 },
    { nameJa: '面粗度', nameEn: 'Surface Roughness', unit: 'Ra', toleranceMin: null, toleranceMax: 0.8, isRequired: false, sortOrder: 4 },
  ],
};

export default function InspectionTemplateEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(templateSchema),
    initialValues: INITIAL,
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '検査表テンプレートを更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', 'マスタ', '検査表テンプレート', '編集']}
      title="検査表テンプレート 編集"
      status={<ActiveBadge active={form.values.isActive} />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="テンプレート情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <TextInput label="コード" placeholder="INSP-CYL-001" withAsterisk {...form.getInputProps('code')} />
          <Switch label="有効" mt={isMobile ? 0 : 'xl'} {...form.getInputProps('isActive', { type: 'checkbox' })} />
        </SimpleGrid>
        <LocalizedTextInput
          label="名称"
          required
          jaProps={form.getInputProps('nameJa')}
          enProps={form.getInputProps('nameEn')}
        />
        <Select
          label="関連工程" placeholder="工程を選択" data={PROCESS_STEPS} searchable clearable mt="sm"
          {...form.getInputProps('relatedStepId')}
        />
      </FormSection>

      <FormSection title="検査項目">
        {isMobile ? (
          <Stack gap="sm">
            {form.values.items.map((_item, index) => (
              <Paper key={index} withBorder p="sm" radius="sm">
                <Stack gap="xs">
                  <LocalizedTextInput
                    label="項目名"
                    required
                    jaProps={form.getInputProps(`items.${index}.nameJa`)}
                    enProps={form.getInputProps(`items.${index}.nameEn`)}
                  />
                  <Group grow gap="xs">
                    <Select label="単位" placeholder="mm" data={UNITS} searchable clearable {...form.getInputProps(`items.${index}.unit`)} />
                    <NumberInput label="表示順" min={0} {...form.getInputProps(`items.${index}.sortOrder`)} />
                  </Group>
                  <Group grow gap="xs">
                    <NumberInput label="許容値下限" decimalScale={3} {...form.getInputProps(`items.${index}.toleranceMin`)} />
                    <NumberInput label="許容値上限" decimalScale={3} {...form.getInputProps(`items.${index}.toleranceMax`)} />
                  </Group>
                  <Switch label="必須" {...form.getInputProps(`items.${index}.isRequired`, { type: 'checkbox' })} />
                  {form.values.items.length > 1 && (
                    <Button variant="subtle" color="red" size="xs" leftSection={<IconMinus size={12} />} onClick={() => form.removeListItem('items', index)}>
                      この項目を削除
                    </Button>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        ) : (
          <Table withColumnBorders={false} withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th style={{ minWidth: 160 }}>項目名（日本語）</Table.Th>
                <Table.Th style={{ minWidth: 160 }}>項目名（英語）</Table.Th>
                <Table.Th style={{ width: 90 }}>単位</Table.Th>
                <Table.Th style={{ width: 100 }}>許容値下限</Table.Th>
                <Table.Th style={{ width: 100 }}>許容値上限</Table.Th>
                <Table.Th style={{ width: 60 }}>必須</Table.Th>
                <Table.Th style={{ width: 70 }}>表示順</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.items.map((_item, index) => (
                <Table.Tr key={index}>
                  <Table.Td><TextInput placeholder="外径" withAsterisk {...form.getInputProps(`items.${index}.nameJa`)} /></Table.Td>
                  <Table.Td><TextInput placeholder="Outer Diameter" withAsterisk {...form.getInputProps(`items.${index}.nameEn`)} /></Table.Td>
                  <Table.Td><Select placeholder="mm" data={UNITS} searchable clearable {...form.getInputProps(`items.${index}.unit`)} /></Table.Td>
                  <Table.Td><NumberInput decimalScale={3} {...form.getInputProps(`items.${index}.toleranceMin`)} /></Table.Td>
                  <Table.Td><NumberInput decimalScale={3} {...form.getInputProps(`items.${index}.toleranceMax`)} /></Table.Td>
                  <Table.Td><Switch {...form.getInputProps(`items.${index}.isRequired`, { type: 'checkbox' })} /></Table.Td>
                  <Table.Td><NumberInput min={0} {...form.getInputProps(`items.${index}.sortOrder`)} /></Table.Td>
                  <Table.Td>
                    <Button variant="subtle" color="red" size="xs" px={4} disabled={form.values.items.length === 1}
                      onClick={() => form.removeListItem('items', index)} aria-label="この項目を削除">
                      <IconMinus size={14} />
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Button variant="subtle" leftSection={<IconPlus size={14} />} mt="sm" size="sm" fullWidth={isMobile}
          onClick={() => form.insertListItem('items', emptyItem(form.values.items.length + 1))}>
          検査項目を追加
        </Button>

        {typeof form.errors.items === 'string' && (
          <Text size="xs" c="red" mt="xs">{form.errors.items}</Text>
        )}
      </FormSection>
    </FormShell>
  );
}
