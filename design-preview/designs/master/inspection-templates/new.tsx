'use client';

import {
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import type { FormErrors } from '@mantine/form';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import { PageHeader } from '../../lib/ui';
import { PROCESS_STEPS, UNITS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

function zodResolver<T>(schema: z.ZodType<T>) {
  return (values: T): FormErrors => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: FormErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (key && !errors[key]) errors[key] = issue.message;
    }
    return errors;
  };
}

// ── Zod schema ───────────────────────────────────────────────────────────────
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

export default function InspectionTemplateNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    validate: zodResolver(templateSchema),
    initialValues: {
      code: '',
      nameJa: '',
      nameEn: '',
      relatedStepId: null,
      isActive: true,
      items: [emptyItem(1)],
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '検査表テンプレートを作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', 'マスタ', '検査表テンプレート', '新規作成']}
        title="検査表テンプレート 新規作成"
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          {/* ── Section 1: テンプレート情報 ──────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">テンプレート情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <TextInput
                label="コード"
                placeholder="INSP-CYL-001"
                withAsterisk
                {...form.getInputProps('code')}
              />
              <Switch
                label="有効"
                mt={isMobile ? 0 : 'xl'}
                {...form.getInputProps('isActive', { type: 'checkbox' })}
              />
              <TextInput
                label="名称（日本語）"
                placeholder="円筒加工 寸法検査表"
                withAsterisk
                {...form.getInputProps('nameJa')}
              />
              <TextInput
                label="名称（英語）"
                placeholder="Cylinder Machining Inspection"
                withAsterisk
                {...form.getInputProps('nameEn')}
              />
              <Select
                label="関連工程"
                placeholder="工程を選択"
                data={PROCESS_STEPS}
                searchable
                clearable
                {...form.getInputProps('relatedStepId')}
              />
            </SimpleGrid>
          </Paper>

          {/* ── Section 2: 検査項目 ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">検査項目</Title>
            <Divider mb="md" />

            {isMobile ? (
              // ── Mobile: card per item ─────────────────────────────────
              <Stack gap="sm">
                {form.values.items.map((_item, index) => (
                  <Paper key={index} withBorder p="sm" radius="sm">
                    <Stack gap="xs">
                      <TextInput
                        label="項目名（日本語）"
                        placeholder="外径"
                        withAsterisk
                        {...form.getInputProps(`items.${index}.nameJa`)}
                      />
                      <TextInput
                        label="項目名（英語）"
                        placeholder="Outer Diameter"
                        withAsterisk
                        {...form.getInputProps(`items.${index}.nameEn`)}
                      />
                      <Group grow gap="xs">
                        <Select
                          label="単位"
                          placeholder="mm"
                          data={UNITS}
                          searchable
                          clearable
                          {...form.getInputProps(`items.${index}.unit`)}
                        />
                        <NumberInput
                          label="表示順"
                          min={0}
                          {...form.getInputProps(`items.${index}.sortOrder`)}
                        />
                      </Group>
                      <Group grow gap="xs">
                        <NumberInput
                          label="許容値下限"
                          decimalScale={3}
                          {...form.getInputProps(`items.${index}.toleranceMin`)}
                        />
                        <NumberInput
                          label="許容値上限"
                          decimalScale={3}
                          {...form.getInputProps(`items.${index}.toleranceMax`)}
                        />
                      </Group>
                      <Switch
                        label="必須"
                        {...form.getInputProps(`items.${index}.isRequired`, { type: 'checkbox' })}
                      />
                      {form.values.items.length > 1 && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          leftSection={<IconMinus size={12} />}
                          onClick={() => form.removeListItem('items', index)}
                        >
                          この項目を削除
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              // ── Desktop: inline table ─────────────────────────────────
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
                      <Table.Td>
                        <TextInput
                          placeholder="外径"
                          withAsterisk
                          {...form.getInputProps(`items.${index}.nameJa`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          placeholder="Outer Diameter"
                          withAsterisk
                          {...form.getInputProps(`items.${index}.nameEn`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          placeholder="mm"
                          data={UNITS}
                          searchable
                          clearable
                          {...form.getInputProps(`items.${index}.unit`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          decimalScale={3}
                          {...form.getInputProps(`items.${index}.toleranceMin`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          decimalScale={3}
                          {...form.getInputProps(`items.${index}.toleranceMax`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          {...form.getInputProps(`items.${index}.isRequired`, { type: 'checkbox' })}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          min={0}
                          {...form.getInputProps(`items.${index}.sortOrder`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          px={4}
                          disabled={form.values.items.length === 1}
                          onClick={() => form.removeListItem('items', index)}
                          aria-label="この項目を削除"
                        >
                          <IconMinus size={14} />
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              mt="sm"
              size="sm"
              fullWidth={isMobile}
              onClick={() =>
                form.insertListItem('items', emptyItem(form.values.items.length + 1))
              }
            >
              検査項目を追加
            </Button>

            {typeof form.errors.items === 'string' && (
              <Text size="xs" c="red" mt="xs">{form.errors.items}</Text>
            )}
          </Paper>

          {/* ── Form actions ─────────────────────────────────────────────── */}
          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>保存</Button>
              <Button variant="default" fullWidth>キャンセル</Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default">キャンセル</Button>
              <Button type="submit" loading={isPending}>保存</Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
