'use client';

import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  LoadingOverlay,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DatePickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconCalendar,
  IconInfoCircle,
  IconMinus,
  IconPlus,
} from '@tabler/icons-react';
import { useTransition } from 'react';
import { z } from 'zod';
import type { FormErrors } from '@mantine/form';
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

// CONFIRMED 受注書 available for 出荷書 creation
const SALES_ORDER_OPTIONS = [
  { value: 'so-001', label: 'ORD-202601-00001-01 — 株式会社ABC製作所' },
  { value: 'so-002', label: 'ORD-202601-00002-01 — 合同会社XYZ工業' },
  { value: 'so-003', label: 'ORD-202512-00018-02 — 東邦精密株式会社' },
];

const WORK_ORDER_OPTIONS = [
  { value: 'wo-1042', label: '指示書 #1042（製造分）' },
  { value: 'wo-1043', label: '指示書 #1043（在庫分）' },
];

const shippingItemSchema = z.object({
  productId: z.string().min(1, '製品を選択してください'),
  lotNumber: z.number().int().nullable(),
  quantity: z.number().int().min(1, '1以上を入力してください'),
  notes: z.string().optional(),
});

const shippingOrderSchema = z.object({
  salesOrderId: z.string().min(1, '受注書を選択してください'),
  workOrderId: z.string().nullable(),
  type: z.enum(['STOCK_STORAGE', 'DISPATCH']),
  shippedAt: z.date().nullable(),
  notes: z.string().optional(),
  items: z.array(shippingItemSchema).min(1, '明細を1件以上入力してください'),
});

type ShippingOrderFormValues = z.infer<typeof shippingOrderSchema>;

const EMPTY_ITEM = { productId: '', lotNumber: null, quantity: 1, notes: '' };

export default function ShippingOrderNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<ShippingOrderFormValues>({
    validate: zodResolver(shippingOrderSchema),
    initialValues: {
      salesOrderId: '',
      workOrderId: null,
      type: 'DISPATCH',
      shippedAt: null,
      notes: '',
      items: [{ ...EMPTY_ITEM }],
    },
  });

  const totalQty = form.values.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const isStorage = form.values.type === 'STOCK_STORAGE';

  const handleSubmit = (values: ShippingOrderFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '出荷書を作成しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  return (
    <Stack gap="md">
      <PageHeader breadcrumbs={['ホーム', '出荷', '出荷書', '新規作成']} title="出荷書 新規作成" />

      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">
          {/* ── Section 1: 基本情報 ─────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              基本情報
            </Title>
            <Divider mb="md" />
            <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
              <Select
                label="受注書"
                placeholder="受注書を選択"
                data={SALES_ORDER_OPTIONS}
                searchable
                withAsterisk
                {...form.getInputProps('salesOrderId')}
              />
              <Select
                label="指示書"
                placeholder="指示書を選択（任意）"
                data={WORK_ORDER_OPTIONS}
                searchable
                clearable
                {...form.getInputProps('workOrderId')}
              />
              <Stack gap={4}>
                <Text size="sm" fw={500}>
                  出荷タイプ
                </Text>
                <SegmentedControl
                  fullWidth
                  data={[
                    { value: 'DISPATCH', label: '発送' },
                    { value: 'STOCK_STORAGE', label: '在庫保管' },
                  ]}
                  {...form.getInputProps('type')}
                />
              </Stack>
              <DatePickerInput
                label="出荷日"
                placeholder="日付を選択"
                leftSection={<IconCalendar size={14} />}
                valueFormat="YYYY/MM/DD"
                clearable
                {...form.getInputProps('shippedAt')}
              />
            </SimpleGrid>

            {isStorage && (
              <Alert color="gray" icon={<IconInfoCircle size={16} />} mt="md" variant="light">
                在庫保管（予備製作分）は請求フロー外です。在庫台帳のみ確定更新され、会計・請求の対象になりません。
              </Alert>
            )}

            <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
          </Paper>

          {/* ── Section 2: 明細 ─────────────────────────────────────────── */}
          <Paper withBorder p="md" radius="md">
            <Title order={4} mb="xs">
              出荷明細
            </Title>
            <Divider mb="md" />

            {isMobile ? (
              <Stack gap="sm">
                {form.values.items.map((item, index) => (
                  <Paper key={index} withBorder p="sm" radius="sm">
                    <Stack gap="xs">
                      <Select
                        label="製品"
                        placeholder="製品を選択"
                        data={PRODUCTS}
                        searchable
                        withAsterisk
                        {...form.getInputProps(`items.${index}.productId`)}
                      />
                      <Group grow gap="xs">
                        <NumberInput
                          label="ロット番号"
                          placeholder="任意"
                          allowDecimal={false}
                          {...form.getInputProps(`items.${index}.lotNumber`)}
                        />
                        <NumberInput
                          label="数量"
                          min={1}
                          withAsterisk
                          suffix=" 本"
                          {...form.getInputProps(`items.${index}.quantity`)}
                        />
                      </Group>
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
              <Table withColumnBorders={false} withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 220 }}>製品</Table.Th>
                    <Table.Th style={{ width: 130 }}>ロット番号</Table.Th>
                    <Table.Th style={{ width: 120 }}>数量</Table.Th>
                    <Table.Th style={{ minWidth: 160 }}>備考</Table.Th>
                    <Table.Th style={{ width: 40 }} />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {form.values.items.map((item, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Select
                          placeholder="製品を選択"
                          data={PRODUCTS}
                          searchable
                          withAsterisk
                          {...form.getInputProps(`items.${index}.productId`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          placeholder="任意"
                          allowDecimal={false}
                          {...form.getInputProps(`items.${index}.lotNumber`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          min={1}
                          withAsterisk
                          suffix=" 本"
                          {...form.getInputProps(`items.${index}.quantity`)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput placeholder="備考" {...form.getInputProps(`items.${index}.notes`)} />
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

            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              mt="sm"
              size="sm"
              fullWidth={isMobile}
              onClick={() => form.insertListItem('items', { ...EMPTY_ITEM })}
            >
              明細を追加
            </Button>

            <Divider mt="sm" />
            <Group justify="flex-end" mt="sm">
              <Text size="sm" c="dimmed">
                合計数量
              </Text>
              <Text fw={700} ff="mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {totalQty} 本
              </Text>
            </Group>
          </Paper>

          {/* ── Form actions ─────────────────────────────────────────────── */}
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
