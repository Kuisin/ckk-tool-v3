'use client';

/**
 * FormPage.tsx — Sample: 見積書 新規作成 (Quote New / Edit)
 *
 * This file shows the standard FORM PAGE pattern for new/page.tsx and [id]/edit/page.tsx.
 * The same structure applies to: order acceptances, sales orders, work orders, invoices.
 *
 * ─── COMPONENT MAP ───────────────────────────────────────────────────────────
 *
 *  Stack (gap="md")
 *  ├── Group (page header: Breadcrumbs + Title)
 *  ├── form (onSubmit → server action or client handler)
 *  │   ├── Paper §1 — 基本情報
 *  │   │   ├── Title order={4} + Divider
 *  │   │   └── SimpleGrid cols={{ base:1, sm:2 }}
 *  │   │       └── TextInput / Select / DatePickerInput / Textarea
 *  │   ├── Paper §2 — 明細
 *  │   │   ├── Title order={4} + Divider
 *  │   │   ├── Table (editable line item rows)
 *  │   │   └── Button variant="subtle" (add row)
 *  │   └── Group (submit + cancel)
 *  │       ├── Button variant="default" component={Link} (cancel)
 *  │       └── Button type="submit" (save)
 *
 * ─── CUSTOMIZATIONS ──────────────────────────────────────────────────────────
 *
 * [Mantine] @mantine/form + zodResolver for form state + validation.
 *   Standard in this project. The useForm hook tracks values, errors, dirty state.
 *   zodResolver connects a Zod schema to Mantine form validation.
 *
 * [Mantine default] Paper, Stack, Group, SimpleGrid, Title, Divider, Breadcrumbs,
 *   TextInput, Select, NumberInput, Textarea, Button — all standard, no customization.
 *
 * [Mantine] DatePickerInput from @mantine/dates — locale="ja" is set globally.
 *   DatePickerInput is used instead of a plain TextInput for date fields
 *   to provide a proper calendar picker UI.
 *
 * [Custom] NumberInput for monetary values:
 *   prefix="¥" + thousandSeparator="," + decimalScale={2} + min={0}
 *   This combination is specific to JPY fields.
 *
 * [Custom] CustomerSelect: two-level Select (parent company → branch).
 *   When a parent is selected, the branch Select repopulates with filtered options.
 *   Defined in src/components/master/CustomerSelect.tsx.
 *
 * [Custom] ProductPriceResolverInput: auto-fills unit_price from price_lists table
 *   after product + quantity are selected. Uses an API call internally.
 *   Defined in src/components/sales/ProductPriceResolverInput.tsx.
 *
 * [Mantine] LoadingOverlay wraps the form during submission.
 *   <Box pos="relative"><LoadingOverlay visible={isPending} />{children}</Box>
 *   Box pos="relative" is required for LoadingOverlay positioning.
 *
 * [Mantine] notifications.show on success/error (from @mantine/notifications).
 *   Called after server action resolves.
 *
 * [Custom] Line items table is editable: add/remove rows, each row has Select + NumberInput.
 *   Row data is managed with form.values.items (array of item objects).
 *   form.insertListItem / form.removeListItem handle row add/remove.
 *
 * [Custom] Server Action submission: form has action={serverAction} prop.
 *   useFormStatus() / useTransition() provides isPending for LoadingOverlay.
 *   In Next.js 15+, Server Actions are the preferred form submission pattern.
 */

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
import Link from 'next/link';
import { useTransition } from 'react';
import { z } from 'zod';

// ── Zod schema ───────────────────────────────────────────────────────────────
// [Custom] Zod schema defines validation rules.
// zodResolver bridges this schema to @mantine/form.
// In production, extract to a shared schema file (e.g., src/lib/schemas/quote.ts).
const quoteItemSchema = z.object({
  productId:   z.string().min(1, '製品を選択してください'),
  orderType:   z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  quantity:    z.number().int().min(1, '1以上を入力してください'),
  unitPrice:   z.number().min(0),
  deliveryDate:z.date().nullable(),
  notes:       z.string().optional(),
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

// ── Main component ───────────────────────────────────────────────────────────
export default function QuoteNewPage() {
  const [isPending, startTransition] = useTransition();

  // [Mantine] useForm with zodResolver
  const form = useForm<QuoteFormValues>({
    validate: quoteSchema,
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

  // Computed total amount
  const totalAmount = form.values.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const handleSubmit = (values: QuoteFormValues) => {
    startTransition(async () => {
      try {
        // In production: await createQuoteAction(values);
        console.log('Submitting:', values);
        notifications.show({
          title: '保存しました',
          message: '見積書を作成しました',
          color: 'green',
        });
      } catch {
        notifications.show({
          title: 'エラー',
          message: '保存に失敗しました',
          color: 'red',
        });
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
          {/* [Mantine] Breadcrumbs */}
          <Breadcrumbs>
            <Link href="/">ホーム</Link>
            <Text size="sm">販売</Text>
            <Link href="/sales/quotes">見積書</Link>
            <Text size="sm">新規作成</Text>
          </Breadcrumbs>
          <Title order={2}>見積書 新規作成</Title>
        </Stack>
      </Group>

      {/* ── Form ──────────────────────────────────────────────────────── */}
      {/*
       * [Mantine] LoadingOverlay needs a pos="relative" parent (Box or another container).
       * [Custom] visible={isPending} ties the overlay to the Server Action pending state.
       */}
      <Box component="form" onSubmit={form.onSubmit(handleSubmit)} pos="relative">
        <LoadingOverlay visible={isPending} />

        <Stack gap="md">

          {/* ── Section 1: 基本情報 ─────────────────────────────────────── */}
          {/*
           * [Mantine] Paper shadow="xs" p="md" — section card container.
           * [Custom] Title order={4} + Divider is the standard section header pattern.
           */}
          <Paper shadow="xs" p="md" radius="md">
            <Title order={4} mb="xs">基本情報</Title>
            <Divider mb="md" />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">

              {/* [Custom] CustomerSelect pattern: parent → branch cascade */}
              {/* In production: <CustomerSelect form={form} required /> */}
              {/* [Mantine] Select searchable — shown when options > 5 */}
              <Select
                label="顧客"
                placeholder="顧客を選択"
                data={MOCK_CUSTOMERS}
                searchable
                withAsterisk
                {...form.getInputProps('customerId')}
                onChange={(value) => {
                  form.setFieldValue('customerId', value ?? '');
                  form.setFieldValue('customerBranchId', null); // reset branch on customer change
                }}
              />
              {/* Branch select — disabled until a parent customer is selected */}
              <Select
                label="支店"
                placeholder={form.values.customerId ? '支店を選択' : '顧客を先に選択'}
                data={branchOptions}
                disabled={!form.values.customerId || branchOptions.length === 0}
                clearable
                {...form.getInputProps('customerBranchId')}
              />

              {/* [Mantine] DatePickerInput from @mantine/dates */}
              {/* [Custom] valueFormat="YYYY/MM/DD" — Japanese date format */}
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
          {/*
           * [Custom] Editable line item table.
           * Each row has: product Select, order type Select, quantity NumberInput,
           * unit price NumberInput (auto-filled), delivery date, remove button.
           * [Mantine] form.insertListItem / removeListItem manage the items array.
           */}
          <Paper shadow="xs" p="md" radius="md">
            <Title order={4} mb="xs">明細</Title>
            <Divider mb="md" />

            {/* Line items table */}
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
                    {/* [Mantine] Select searchable for product */}
                    {/* [Custom] In production: use ProductPriceResolverInput component */}
                    {/* which auto-fetches unit price from price_lists on product + qty change */}
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
                        data={[
                          { value: 'PRODUCTION', label: '本番' },
                          { value: 'TEST',       label: 'テスト' },
                          { value: 'SAMPLE',     label: 'サンプル' },
                          { value: 'OTHER',      label: 'その他' },
                        ]}
                        {...form.getInputProps(`items.${index}.orderType`)}
                      />
                    </Table.Td>
                    <Table.Td>
                      {/* [Mantine] NumberInput min={1} for quantity */}
                      <NumberInput
                        min={1}
                        withAsterisk
                        {...form.getInputProps(`items.${index}.quantity`)}
                      />
                    </Table.Td>
                    <Table.Td>
                      {/*
                       * [Custom] JPY unit price input:
                       *   prefix="¥" + thousandSeparator="," + decimalScale={2}
                       * [Custom] In production: auto-filled by ProductPriceResolverInput;
                       *          user can manually override.
                       */}
                      <NumberInput
                        prefix="¥"
                        thousandSeparator=","
                        decimalScale={2}
                        min={0}
                        {...form.getInputProps(`items.${index}.unitPrice`)}
                      />
                    </Table.Td>
                    <Table.Td>
                      {/* [Custom] Computed amount (quantity × unit price) — read-only */}
                      <Text size="sm" ta="right" ff="mono">
                        ¥{(item.quantity * item.unitPrice).toLocaleString('ja-JP')}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {/* [Mantine] DatePickerInput for delivery date */}
                      <DatePickerInput
                        placeholder="納期"
                        valueFormat="YYYY/MM/DD"
                        clearable
                        {...form.getInputProps(`items.${index}.deliveryDate`)}
                      />
                    </Table.Td>
                    <Table.Td>
                      {/* [Mantine] ActionIcon for removing a row */}
                      {/* [Custom] disabled when only 1 row remains */}
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

            {/* Add row button */}
            {/* [Mantine] Button variant="subtle" leftSection for low-emphasis action */}
            <Button
              variant="subtle"
              leftSection={<IconPlus size={14} />}
              mt="sm"
              size="sm"
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

            {/* Total row */}
            <Divider mt="sm" />
            <Group justify="flex-end" mt="sm">
              <Text size="sm" c="dimmed">合計金額</Text>
              {/* [Custom] MoneyText equivalent — inline formatted */}
              <Text fw={700}>
                {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(totalAmount)}
              </Text>
            </Group>
          </Paper>

          {/* ── Form actions ─────────────────────────────────────────────── */}
          {/*
           * [Mantine] Group justify="flex-end" mt="md" — aligns buttons to the right.
           * [Custom] Cancel button navigates back without submitting.
           * [Mantine] Button type="submit" — triggers form.onSubmit handler.
           */}
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              component={Link}
              href="/sales/quotes"
            >
              キャンセル
            </Button>
            <Button type="submit" loading={isPending}>
              保存
            </Button>
          </Group>

        </Stack>
      </Box>
    </Stack>
  );
}
