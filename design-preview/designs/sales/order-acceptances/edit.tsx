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
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import type { FormErrors } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconUpload } from '@tabler/icons-react';
import { useState, useTransition } from 'react';
import { z } from 'zod';
import { formatMoney, PageHeader } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import { BRANCHES, CUSTOMERS } from '../../lib/mock';
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
  quoteId: z.string().nullable(),
  customerId: z.string().min(1, '顧客を選択してください'),
  customerBranchId: z.string().nullable(),
  customerOrderRef: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const QUOTE_OPTIONS = [
  { value: 'q1', label: 'QOT-202606-00001 — 株式会社ABC製作所' },
  { value: 'q2', label: 'QOT-202606-00002 — 合同会社XYZ工業' },
];

const COMPUTED_TOTAL = 281000;

export default function OrderAcceptanceEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();
  const [orderDocFile, setOrderDocFile] = useState<File | null>(null);

  const form = useForm<FormValues>({
    validate: zodResolver(schema),
    initialValues: {
      quoteId: 'q1',
      customerId: 'bp-001',
      customerBranchId: 'bp-001-t',
      customerOrderRef: 'PO-ABC-2026-0512',
      notes: '',
    },
  });

  const handleSubmit = (values: FormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values, orderDocFile);
        notifications.show({ title: '保存しました', message: '注文受諾書を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const branchOptions = form.values.customerId ? (BRANCHES[form.values.customerId] ?? []) : [];

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '販売', '注文受諾書', '編集']}
        title="注文受諾書 編集"
        status={<StatusBadge entity="OrderAcceptance" status="CONFIRMED" />}
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="見積書"
                placeholder="関連する見積書を選択（任意）"
                data={QUOTE_OPTIONS}
                searchable
                clearable
                {...form.getInputProps('quoteId')}
              />
              <TextInput
                label="顧客注文書番号"
                placeholder="FAX等で受領した注文書番号"
                {...form.getInputProps('customerOrderRef')}
              />
              <Select
                label="顧客"
                placeholder="顧客を選択"
                data={CUSTOMERS}
                searchable
                withAsterisk
                {...form.getInputProps('customerId')}
                onChange={(value) => {
                  form.setFieldValue('customerId', value ?? '');
                  form.setFieldValue('customerBranchId', null);
                }}
              />
              <Select
                label="支店"
                placeholder={form.values.customerId ? '支店を選択' : '顧客を先に選択'}
                data={branchOptions}
                disabled={!form.values.customerId || branchOptions.length === 0}
                clearable
                {...form.getInputProps('customerBranchId')}
              />
            </SimpleGrid>
            <Textarea
              label="備考"
              placeholder="備考・特記事項"
              mt="sm"
              rows={3}
              {...form.getInputProps('notes')}
            />
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">注文書 PDF</Title>
            <Divider mb="md" />
            <Group align="center" gap="sm">
              <FileButton onChange={setOrderDocFile} accept="application/pdf">
                {(props) => (
                  <Button variant="default" leftSection={<IconUpload size={16} />} {...props}>
                    注文書を再アップロード
                  </Button>
                )}
              </FileButton>
              <Text size="sm" c={orderDocFile ? undefined : 'dimmed'}>
                {orderDocFile ? orderDocFile.name : 'order-ABC-2026-0512.pdf'}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">
              受領した注文書 PDF は SeaweedFS に保存され files テーブルで参照されます。
            </Text>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">合計金額</Title>
            <Divider mb="md" />
            <Group justify="space-between">
              <Text size="sm" c="dimmed">合計金額（自動計算・手動編集不可）</Text>
              <Text fw={700} size="lg" ff="mono">{formatMoney(COMPUTED_TOTAL)}</Text>
            </Group>
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
