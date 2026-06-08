'use client';

import {
  Box,
  Button,
  Divider,
  FileButton,
  Group,
  LoadingOverlay,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { FormErrors } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconUpload } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { z } from 'zod';
import { PageHeader } from '../../lib/ui';
import { PRODUCTS } from '../../lib/mock';
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

const schema = z.object({
  trigger: z.enum(['QUOTE', 'SALES_ORDER']),
  quoteId: z.string().nullable(),
  salesOrderId: z.string().nullable(),
  productId: z.string().nullable(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const QUOTE_OPTIONS = [
  { value: 'q1', label: 'QOT-202606-00001 — 株式会社ABC製作所' },
  { value: 'q2', label: 'QOT-202606-00002 — 合同会社XYZ工業' },
];

const SALES_ORDER_OPTIONS = [
  { value: 'so1', label: 'ORD-202606-00001-01 — 精密軸' },
  { value: 'so2', label: 'ORD-202606-00002-01 — ロッド' },
];

export default function DesignRequestNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [designFile, setDesignFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      trigger: 'QUOTE',
      quoteId: null,
      salesOrderId: null,
      productId: null,
      description: '',
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values, designFile);
        notifications.show({ title: '保存しました', message: '設計依頼書を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const isQuote = form.values.trigger === 'QUOTE';

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '販売', '設計依頼書', '新規作成']} title="設計依頼書 新規作成" />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="トリガー"
                data={[
                  { value: 'QUOTE', label: '見積時' },
                  { value: 'SALES_ORDER', label: '受注時' },
                ]}
                withAsterisk
                {...form.getInputProps('trigger')}
                onChange={(value) => {
                  form.setFieldValue('trigger', (value ?? 'QUOTE') as FormValues['trigger']);
                  form.setFieldValue('quoteId', null);
                  form.setFieldValue('salesOrderId', null);
                }}
              />
              {isQuote ? (
                <Select
                  label="見積書"
                  placeholder="関連する見積書を選択"
                  data={QUOTE_OPTIONS}
                  searchable
                  clearable
                  {...form.getInputProps('quoteId')}
                />
              ) : (
                <Select
                  label="受注書"
                  placeholder="関連する受注書を選択"
                  data={SALES_ORDER_OPTIONS}
                  searchable
                  clearable
                  {...form.getInputProps('salesOrderId')}
                />
              )}
              <Select
                label="製品"
                placeholder="製品を選択"
                data={PRODUCTS}
                searchable
                clearable
                {...form.getInputProps('productId')}
              />
            </SimpleGrid>
            <Textarea
              label="説明"
              placeholder="設計内容・要望の説明"
              mt="sm"
              rows={4}
              {...form.getInputProps('description')}
            />
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">設計図</Title>
            <Divider mb="md" />
            <Group align="center" gap="sm">
              <FileButton onChange={setDesignFile} accept="application/pdf,image/*,.dwg,.dxf">
                {(props) => (
                  <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                    設計図をアップロード
                  </Button>
                )}
              </FileButton>
              <Text size="sm" c={designFile ? undefined : 'dimmed'}>
                {designFile ? designFile.name : 'ファイルが選択されていません'}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
              設計図は SeaweedFS に保存され、バージョン管理されます（version / is_latest）。
            </Text>
          </Paper>

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
