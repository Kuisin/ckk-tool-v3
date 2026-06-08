'use client';

import { useTransition } from 'react';
import {
  Button,
  Divider,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconCalendar, IconMinus, IconPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { formatMoney } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { FormSection, FormShell } from '../../lib/shells';
import { BRANCHES, CUSTOMERS, ORDER_TYPE_OPTIONS, PRODUCTS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';

const quoteItemSchema = z.object({
  productId: z.string().min(1, '製品を選択してください'),
  orderType: z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  quantity: z.number().int().min(1, '1以上を入力してください'),
  unitPrice: z.number().min(0),
  deliveryDate: z.date().nullable(),
  notes: z.string().optional(),
});

const quoteSchema = z.object({
  customerId: z.string().min(1, '顧客を選択してください'),
  customerBranchId: z.string().nullable(),
  validUntil: z.date().nullable(),
  notes: z.string().optional(),
  items: z.array(quoteItemSchema).min(1, '明細を1件以上入力してください'),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

// Auto-fill hint: nominal price-list unit price per product (editable override).
const PRICE_HINT: Record<string, number> = {
  'PRD-2601-0001': 5000,
  'PRD-2602-0008': 6200,
  'PRD-2603-0012': 9500,
};

const EMPTY_ITEM = { productId: '', orderType: 'PRODUCTION' as const, quantity: 1, unitPrice: 0, deliveryDate: null, notes: '' };

export default function QuoteNewPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  const form = useForm<QuoteFormValues>({
    validate: zodResolver(quoteSchema),
    initialValues: {
      customerId: '',
      customerBranchId: null,
      validUntil: null,
      notes: '',
      items: [{ ...EMPTY_ITEM }],
    },
  });

  const totalAmount = form.values.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

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

  const branchOptions = form.values.customerId ? (BRANCHES[form.values.customerId] ?? []) : [];

  // Auto-fill unit price from price list when product selected (editable after).
  const onProductChange = (index: number, value: string | null) => {
    form.setFieldValue(`items.${index}.productId`, value ?? '');
    if (value && PRICE_HINT[value] != null) {
      form.setFieldValue(`items.${index}.unitPrice`, PRICE_HINT[value]);
    }
  };

  return (
    <FormShell
      breadcrumbs={['ホーム', '販売', '見積書', '新規作成']}
      title="見積書 新規作成"
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select
            label="顧客" placeholder="顧客を選択" data={CUSTOMERS} searchable withAsterisk
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
            label="有効期限" placeholder="日付を選択" leftSection={<IconCalendar size={14} />}
            valueFormat="YYYY/MM/DD" clearable {...form.getInputProps('validUntil')}
          />
        </SimpleGrid>
        <Textarea label="備考" placeholder="備考・特記事項" mt="sm" rows={3} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="明細">
        {isMobile ? (
          <Stack gap="sm">
            {form.values.items.map((item, index) => (
              <Paper key={index} withBorder p="sm" radius="sm">
                <Stack gap="xs">
                  <Select label="製品" placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
                    {...form.getInputProps(`items.${index}.productId`)}
                    onChange={(value) => onProductChange(index, value)}
                  />
                  <Select label="注文種別" data={ORDER_TYPE_OPTIONS} {...form.getInputProps(`items.${index}.orderType`)} />
                  <Group grow gap="xs">
                    <NumberInput label="数量" min={1} withAsterisk {...form.getInputProps(`items.${index}.quantity`)} />
                    <NumberInput label="単価" description="価格表から自動入力" prefix="¥" thousandSeparator="," decimalScale={2} min={0}
                      {...form.getInputProps(`items.${index}.unitPrice`)} />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">金額</Text>
                    <Text size="sm" fw={600} ff="mono">{formatMoney(item.quantity * item.unitPrice)}</Text>
                  </Group>
                  <DatePickerInput label="納期" placeholder="日付を選択" valueFormat="YYYY/MM/DD" clearable
                    {...form.getInputProps(`items.${index}.deliveryDate`)} />
                  {form.values.items.length > 1 && (
                    <Button variant="subtle" color="red" size="xs" leftSection={<IconMinus size={12} />}
                      onClick={() => form.removeListItem('items', index)}>
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
                <Table.Th style={{ minWidth: 200 }}>製品</Table.Th>
                <Table.Th style={{ width: 120 }}>種別</Table.Th>
                <Table.Th style={{ width: 80 }}>数量</Table.Th>
                <Table.Th style={{ width: 130 }}>単価</Table.Th>
                <Table.Th style={{ width: 100 }}>金額</Table.Th>
                <Table.Th style={{ width: 130 }}>納期</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {form.values.items.map((item, index) => (
                <Table.Tr key={index}>
                  <Table.Td>
                    <Select placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
                      {...form.getInputProps(`items.${index}.productId`)}
                      onChange={(value) => onProductChange(index, value)} />
                  </Table.Td>
                  <Table.Td><Select data={ORDER_TYPE_OPTIONS} {...form.getInputProps(`items.${index}.orderType`)} /></Table.Td>
                  <Table.Td><NumberInput min={1} withAsterisk {...form.getInputProps(`items.${index}.quantity`)} /></Table.Td>
                  <Table.Td><NumberInput prefix="¥" thousandSeparator="," decimalScale={2} min={0} {...form.getInputProps(`items.${index}.unitPrice`)} /></Table.Td>
                  <Table.Td><Text size="sm" ta="right" ff="mono">{formatMoney(item.quantity * item.unitPrice)}</Text></Table.Td>
                  <Table.Td><DatePickerInput placeholder="納期" valueFormat="YYYY/MM/DD" clearable {...form.getInputProps(`items.${index}.deliveryDate`)} /></Table.Td>
                  <Table.Td>
                    <Button variant="subtle" color="red" size="xs" px={4} disabled={form.values.items.length === 1}
                      onClick={() => form.removeListItem('items', index)} aria-label="この行を削除">
                      <IconMinus size={14} />
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Button variant="subtle" leftSection={<IconPlus size={14} />} mt="sm" size="sm" fullWidth={isMobile}
          onClick={() => form.insertListItem('items', { ...EMPTY_ITEM })}>
          明細を追加
        </Button>

        <Divider mt="sm" />
        <Group justify="flex-end" mt="sm">
          <Text size="sm" c="dimmed">合計金額</Text>
          <Text fw={700}>{formatMoney(totalAmount)}</Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
