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
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCalendar } from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import type { FormErrors } from '@mantine/form';
import { PageHeader } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  END_USERS,
  ORDER_TYPE_OPTIONS,
  PRODUCTS,
} from '../../lib/mock';
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

const ORDER_ACCEPTANCE_OPTIONS = [
  { value: 'oa-001', label: 'ORD-202601-00001 — 株式会社ABC製作所' },
  { value: 'oa-002', label: 'ORD-202601-00002 — 合同会社XYZ工業' },
  { value: 'oa-003', label: 'ORD-202601-00003 — 株式会社DEFエンジニアリング' },
];

const salesOrderSchema = z.object({
  orderAcceptanceId: z.string().min(1, '注文受諾書を選択してください'),
  productId: z.string().min(1, '製品を選択してください'),
  lotNumber: z.number().int().nullable(),
  orderType: z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  quantity: z.number().int().min(1, '1以上を入力してください'),
  unitPrice: z.number().min(0),
  deliveryDate: z.date().nullable(),
  endUserId: z.string().nullable(),
  notes: z.string().optional(),
});

type SalesOrderFormValues = z.infer<typeof salesOrderSchema>;

export default function SalesOrderEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<SalesOrderFormValues>({
    validate: zodResolver(salesOrderSchema),
    initialValues: {
      orderAcceptanceId: 'oa-001',
      productId: 'PRD-2601-0001',
      lotNumber: 1042,
      orderType: 'PRODUCTION',
      quantity: 50,
      unitPrice: 5000,
      deliveryDate: new Date('2026-06-15'),
      endUserId: 'eu-001',
      notes: '客先指定の表面粗さ Ra0.4 以下',
    },
  });

  const amount = form.values.quantity * form.values.unitPrice;

  const handleSubmit = (values: SalesOrderFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '受注書を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '生産', '受注書', 'ORD-202601-00001-01', '編集']}
        title="受注書 編集"
        status={<StatusBadge entity="SalesOrder" status="CONFIRMED" />}
      />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              基本情報
            </Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="注文受諾書"
                placeholder="注文受諾書を選択"
                data={ORDER_ACCEPTANCE_OPTIONS}
                searchable
                withAsterisk
                {...form.getInputProps('orderAcceptanceId')}
              />
              <Select
                label="製品"
                placeholder="製品を選択"
                data={PRODUCTS}
                searchable
                withAsterisk
                {...form.getInputProps('productId')}
              />
              <NumberInput
                label="ロット番号"
                description="指示書と共用の通し連番"
                allowDecimal={false}
                {...form.getInputProps('lotNumber')}
              />
              <Select
                label="注文種別"
                data={ORDER_TYPE_OPTIONS}
                withAsterisk
                {...form.getInputProps('orderType')}
              />
              <Select
                label="最終需要家"
                placeholder="最終需要家を選択（任意）"
                data={END_USERS}
                searchable
                clearable
                {...form.getInputProps('endUserId')}
              />
              <DatePickerInput
                label="納期"
                placeholder="日付を選択"
                leftSection={<IconCalendar size={14} />}
                valueFormat="YYYY/MM/DD"
                clearable
                {...form.getInputProps('deliveryDate')}
              />
            </SimpleGrid>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              数量・金額
            </Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
              <NumberInput label="数量" min={1} withAsterisk suffix=" 本" {...form.getInputProps('quantity')} />
              <NumberInput
                label="単価"
                prefix="¥"
                thousandSeparator=","
                decimalScale={2}
                min={0}
                {...form.getInputProps('unitPrice')}
              />
              <Stack gap={2} justify="flex-end">
                <Text size="xs" c="dimmed">
                  金額（自動計算）
                </Text>
                <Text size="lg" fw={700} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount)}
                </Text>
              </Stack>
            </SimpleGrid>

            <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
          </Paper>

          {isMobile ? (
            <Stack gap="xs">
              <Button type="submit" loading={isPending} fullWidth>
                保存
              </Button>
              <Button variant="default" fullWidth>
                キャンセル
              </Button>
            </Stack>
          ) : (
            <Group justify="flex-end" mt="md">
              <Button variant="default">キャンセル</Button>
              <Button type="submit" loading={isPending}>
                保存
              </Button>
            </Group>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
