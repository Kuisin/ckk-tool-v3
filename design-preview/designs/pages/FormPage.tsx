'use client';

import {
  Box,
  Breadcrumbs,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconMinus,
  IconPlus,
} from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import type { FormErrors } from '@mantine/form';
import { useIsMobile } from '../lib/viewport-context';

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
const quoteItemSchema = z.object({
  productId:    z.string().min(1, '製品を選択してください'),
  orderType:    z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  quantity:     z.number().int().min(1, '1以上を入力してください'),
  unitPrice:    z.number().min(0),
  deliveryDate: z.date().nullable(),
  notes:        z.string().optional(),
});

const quoteSchema = z.object({
  customerId:       z.string().min(1, '顧客を選択してください'),
  customerBranchId: z.string().nullable(),
  validUntil:       z.date().nullable(),
  notes:            z.string().optional(),
  items:            z.array(quoteItemSchema).min(1, '明細を1件以上入力してください'),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_CUSTOMERS = [
  { value: 'c1', label: '株式会社ABC' },
  { value: 'c2', label: '合同会社XYZ' },
  { value: 'c3', label: '株式会社DEF' },
];

const MOCK_BRANCHES: Record<string, { value: string; label: string }[]> = {
  c1: [{ value: 'b1', label: '東京本社' }, { value: 'b2', label: '大阪支社' }],
  c2: [],
  c3: [{ value: 'b3', label: '名古屋支店' }],
};

const MOCK_PRODUCTS = [
  { value: 'PRD-202601-0001', label: '精密軸 PRD-202601-0001' },
  { value: 'PRD-202602-0008', label: 'ロッド PRD-202602-0008' },
  { value: 'PRD-202603-0012', label: '特殊加工品 PRD-202603-0012' },
];

const ORDER_TYPE_OPTIONS = [
  { value: 'PRODUCTION', label: '本番' },
  { value: 'TEST',       label: 'テスト' },
  { value: 'SAMPLE',     label: 'サンプル' },
  { value: 'OTHER',      label: 'その他' },
];

// ── Main component ───────────────────────────────────────────────────────────
export default function QuoteNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<QuoteFormValues>({
    validate: zodResolver(quoteSchema),
    initialValues: {
      customerId:       '',
      customerBranchId: null,
      validUntil:       null,
      notes:            '',
      items: [
        { productId: '', orderType: 'PRODUCTION', quantity: 1, unitPrice: 0, deliveryDate: null, notes: '' },
      ],
    },
  });

  const totalAmount = form.values.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const handleSubmit = (values: QuoteFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '見積書を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const branchOptions = form.values.customerId
    ? (MOCK_BRANCHES[form.values.customerId] ?? [])
    : [];

  return (
    <Stack gap="md">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          {!isMobile && (
            <Breadcrumbs>
              <Text size="sm">ホーム</Text>
              <Text size="sm">販売</Text>
              <Text size="sm">見積書</Text>
              <Text size="sm">新規作成</Text>
            </Breadcrumbs>
          )}
          <Title order={isMobile ? 3 : 2}>見積書 新規作成</Title>
        </Stack>
      </Group>

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">

          {/* ── Section 1: 基本情報 ─────────────────────────────────────── */}
          <Paper shadow="xs" p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            {/*
             * [Custom] cols is JS-driven (not CSS breakpoint) so the form correctly
             * switches to 1 column in the 390px mobile preview.
             */}
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="顧客"
                placeholder="顧客を選択"
                data={MOCK_CUSTOMERS}
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
              <DatePickerInput
                label="有効期限"
                placeholder="日付を選択"
                leftSection={<IconCalendar size={14} />}
                valueFormat="YYYY/MM/DD"
                clearable
                {...form.getInputProps('validUntil')}
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

          {/* ── Section 2: 明細 ─────────────────────────────────────────── */}
          <Paper shadow="xs" p="md" radius="md">
            <Title order={4} mb="xs">明細</Title>
            <Divider mb="md" />

            {/*
             * Desktop: compact table layout.
             * Mobile: each item rendered as a card (table overflows at 390px).
             */}
            {isMobile ? (
              // ── Mobile: card per item ──────────────────────────────────
              <Stack gap="sm">
                {form.values.items.map((item, index) => (
                  <Paper key={index} withBorder p="sm" radius="sm">
                    <Stack gap="xs">
                      <Select
                        label="製品"
                        placeholder="製品を選択"
                        data={MOCK_PRODUCTS}
                        searchable
                        withAsterisk
                        {...form.getInputProps(`items.${index}.productId`)}
                      />
                      <Select
                        label="注文種別"
                        data={ORDER_TYPE_OPTIONS}
                        {...form.getInputProps(`items.${index}.orderType`)}
                      />
                      <Group grow gap="xs">
                        <NumberInput
                          label="数量"
                          min={1}
                          withAsterisk
                          {...form.getInputProps(`items.${index}.quantity`)}
                        />
                        <NumberInput
                          label="単価"
                          prefix="¥"
                          thousandSeparator=","
                          decimalScale={2}
                          min={0}
                          {...form.getInputProps(`items.${index}.unitPrice`)}
                        />
                      </Group>
                      {/* Computed amount */}
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">金額</Text>
                        <Text size="sm" fw={600} ff="mono">
                          ¥{(item.quantity * item.unitPrice).toLocaleString('ja-JP')}
                        </Text>
                      </Group>
                      <DatePickerInput
                        label="納期"
                        placeholder="日付を選択"
                        valueFormat="YYYY/MM/DD"
                        clearable
                        {...form.getInputProps(`items.${index}.deliveryDate`)}
                      />
                      {/* Remove button — hidden when only 1 item */}
                      {form.values.items.length > 1 && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          leftSection={<IconMinus size={12} />}
                          onClick={() => form.removeListItem('items', index)}
                        >
                          この明細を削除
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            ) : (
              // ── Desktop: table layout ──────────────────────────────────
              <Table withColumnBorders={false} withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 200 }}>製品</Table.Th>
                    <Table.Th style={{ width: 120 }}>種別</Table.Th>
                    <Table.Th style={{ width: 80 }}>数量</Table.Th>
                    <Table.Th style={{ width: 120 }}>単価</Table.Th>
                    <Table.Th style={{ width: 90 }}>金額</Table.Th>
                    <Table.Th style={{ width: 130 }}>納期</Table.Th>
                    <Table.Th style={{ width: 40 }}></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.values.items.map((item, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Select
                          placeholder="製品を選択"
                          data={MOCK_PRODUCTS}
                          searchable
                          withAsterisk
                          {...form.getInputProps(`items.${index}.productId`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          data={ORDER_TYPE_OPTIONS}
                          {...form.getInputProps(`items.${index}.orderType`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          min={1}
                          withAsterisk
                          {...form.getInputProps(`items.${index}.quantity`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          prefix="¥"
                          thousandSeparator=","
                          decimalScale={2}
                          min={0}
                          {...form.getInputProps(`items.${index}.unitPrice`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" ta="right" ff="mono">
                          ¥{(item.quantity * item.unitPrice).toLocaleString('ja-JP')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <DatePickerInput
                          placeholder="納期"
                          valueFormat="YYYY/MM/DD"
                          clearable
                          {...form.getInputProps(`items.${index}.deliveryDate`)}
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
                          aria-label="この行を削除"
                        >
                          <IconMinus size={14} />
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}

            {/* Add row button */}
            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              mt="sm"
              size="sm"
              fullWidth={isMobile}
              onClick={() =>
                form.insertListItem('items', {
                  productId: '',
                  orderType: 'PRODUCTION',
                  quantity: 1,
                  unitPrice: 0,
                  deliveryDate: null,
                  notes: '',
                })
              }
            >
              明細を追加
            </Button>

            {/* Total */}
            <Divider mt="sm" />
            <Group justify="flex-end" mt="sm">
              <Text size="sm" c="dimmed">合計金額</Text>
              <Text fw={700}>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalAmount)}
              </Text>
            </Group>
          </Paper>

          {/* ── Form actions ─────────────────────────────────────────────── */}
          {isMobile ? (
            // Mobile: full-width stacked buttons
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
