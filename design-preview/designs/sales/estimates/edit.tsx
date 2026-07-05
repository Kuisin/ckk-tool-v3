'use client';

import { useTransition } from 'react';
import {
  Alert,
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
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle, IconMinus, IconPlus } from '@tabler/icons-react';
import { z } from 'zod';
import { formatMoney } from '../../lib/ui';
import { zodResolver } from '../../lib/form';
import { StatusBadge } from '../../lib/status';
import { FormSection, FormShell } from '../../lib/shells';
import { CUSTOMERS, MATERIALS, ORDER_TYPE_OPTIONS, PRODUCTS } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import {
  type CostInputs,
  effectiveUnitPrice,
  grossMarginRate,
  suggestedUnitPrice,
  tierUnitCost,
} from './_calc';

const tierSchema = z.object({
  minQuantity: z.number().int().min(1, '1以上を入力してください'),
  maxQuantity: z.number().int().nullable(),
  priceOverride: z.number().min(0).nullable(),
}).refine((t) => t.maxQuantity == null || t.maxQuantity >= t.minQuantity, {
  message: '上限は下限以上を入力してください',
  path: ['maxQuantity'],
});

const estimateSchema = z.object({
  customerId: z.string().min(1, '顧客を選択してください'),
  productId: z.string().min(1, '製品を選択してください'),
  orderType: z.enum(['PRODUCTION', 'TEST', 'SAMPLE', 'OTHER']),
  materialId: z.string().nullable(),
  materialUnitCost: z.number().min(0),
  machiningMinutes: z.number().min(0),
  machiningRate: z.number().min(0),
  outsourceCost: z.number().min(0),
  setupCost: z.number().min(0),
  marginRate: z.number().min(0, '0以上を入力してください').max(99, '99以下を入力してください'),
  notes: z.string().optional(),
  tiers: z.array(tierSchema).min(1, '数量区分を1件以上入力してください'),
});

type EstimateFormValues = z.infer<typeof estimateSchema>;

const EMPTY_TIER = { minQuantity: 1, maxQuantity: null, priceOverride: null };

export default function EstimateEditPage() {
  const isMobile = useIsMobile();
  const [isPending, startTransition] = useTransition();

  // EST-202606-00015 の既存値
  const form = useForm<EstimateFormValues>({
    validate: zodResolver(estimateSchema),
    initialValues: {
      customerId: 'bp-002',
      productId: 'PRD-2602-0008',
      orderType: 'PRODUCTION',
      materialId: 'A02B0014-B001-002',
      materialUnitCost: 1800,
      machiningMinutes: 24,
      machiningRate: 4800,
      outsourceCost: 650,
      setupCost: 24000,
      marginRate: 30,
      notes: 'コーティングは中央コーティング工業へ外注前提。',
      tiers: [
        { minQuantity: 50, maxQuantity: 199, priceOverride: null },
        { minQuantity: 200, maxQuantity: null, priceOverride: 6200 },
      ],
    },
  });

  const costs: CostInputs = {
    materialUnitCost: form.values.materialUnitCost,
    machiningMinutes: form.values.machiningMinutes,
    machiningRate: form.values.machiningRate,
    outsourceCost: form.values.outsourceCost,
    setupCost: form.values.setupCost,
    marginRate: form.values.marginRate,
  };

  const handleSubmit = (values: EstimateFormValues) => {
    startTransition(async () => {
      try {
        console.log('Submitting:', values);
        notifications.show({ title: '保存しました', message: '試算を更新しました', color: 'green' });
      } catch {
        notifications.show({ title: 'エラー', message: '保存に失敗しました', color: 'red' });
      }
    });
  };

  const tierRows = form.values.tiers.map((tier, index) => {
    const cost = tierUnitCost(costs, tier.minQuantity);
    const suggested = suggestedUnitPrice(cost, costs.marginRate);
    const effective = effectiveUnitPrice(costs, tier);
    const margin = grossMarginRate(effective, cost);
    return { tier, index, cost, suggested, effective, margin };
  });

  return (
    <FormShell
      breadcrumbs={['ホーム', '販売', '試算', 'EST-202606-00015', '編集']}
      title="試算 編集"
      status={<StatusBadge entity="Estimate" status="CONFIRMED" />}
      isPending={isPending}
      onSubmit={form.onSubmit(handleSubmit)}
      submitLabel="試算を保存"
    >
      <FormSection title="基本情報">
        <SimpleGrid cols={isMobile ? 1 : 2} spacing="sm">
          <Select label="顧客" placeholder="顧客を選択" data={CUSTOMERS} searchable withAsterisk
            {...form.getInputProps('customerId')} />
          <Select label="製品" placeholder="製品を選択" data={PRODUCTS} searchable withAsterisk
            {...form.getInputProps('productId')} />
          <Select label="注文種別" data={ORDER_TYPE_OPTIONS} {...form.getInputProps('orderType')} />
          <Select label="素材" placeholder="素材を選択" data={MATERIALS} searchable clearable
            {...form.getInputProps('materialId')} />
        </SimpleGrid>
        <Textarea label="備考" placeholder="前提条件・特記事項" mt="sm" rows={2} {...form.getInputProps('notes')} />
      </FormSection>

      <FormSection title="原価入力" description="1本あたりの原価要素と利益率。数量区分ごとの単価は下で自動計算されます。">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="sm">
          <NumberInput label="材料費（/本）" prefix="¥" thousandSeparator="," decimalScale={2} min={0}
            {...form.getInputProps('materialUnitCost')} />
          <NumberInput label="加工時間（分/本）" suffix=" 分" decimalScale={1} min={0}
            {...form.getInputProps('machiningMinutes')} />
          <NumberInput label="加工レート（/時）" prefix="¥" thousandSeparator="," decimalScale={0} min={0}
            {...form.getInputProps('machiningRate')} />
          <NumberInput label="外注費（/本）" prefix="¥" thousandSeparator="," decimalScale={2} min={0}
            {...form.getInputProps('outsourceCost')} />
          <NumberInput label="段取り費（固定）" description="数量区分の下限本数で按分"
            prefix="¥" thousandSeparator="," decimalScale={0} min={0}
            {...form.getInputProps('setupCost')} />
          <NumberInput label="利益率" suffix=" %" decimalScale={1} min={0} max={99} withAsterisk
            {...form.getInputProps('marginRate')} />
        </SimpleGrid>
      </FormSection>

      <FormSection title="数量区分と計算結果" description="本数範囲ごとに原価・単価を自動計算。単価は必要に応じて調整できます。">
        <Alert variant="light" color="blue" icon={<IconInfoCircle size={16} />} mb="md">
          単価 = 原価 ÷ (1 − 利益率)（10円単位切り上げ）。価格表登録済（REGISTERED）の試算は編集できません — 複製して再試算してください。
        </Alert>
        {isMobile ? (
          <Stack gap="sm">
            {tierRows.map(({ tier, index, cost, suggested, effective, margin }) => (
              <Paper key={index} withBorder p="sm" radius="sm">
                <Stack gap="xs">
                  <Group grow gap="xs">
                    <NumberInput label="数量下限" min={1} withAsterisk {...form.getInputProps(`tiers.${index}.minQuantity`)} />
                    <NumberInput label="数量上限" placeholder="上限なし" min={1} {...form.getInputProps(`tiers.${index}.maxQuantity`)} />
                  </Group>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">原価/本</Text>
                    <Text size="sm" ff="mono">{formatMoney(cost)}</Text>
                  </Group>
                  <NumberInput label="単価（調整）" description={`自動計算: ${formatMoney(suggested)}`}
                    placeholder={formatMoney(suggested)} prefix="¥" thousandSeparator="," decimalScale={2} min={0}
                    {...form.getInputProps(`tiers.${index}.priceOverride`)} />
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">採用単価 / 粗利率</Text>
                    <Text size="sm" fw={600} ff="mono">
                      {formatMoney(effective)}（{margin.toFixed(1)}%）
                    </Text>
                  </Group>
                  {form.values.tiers.length > 1 && (
                    <Button variant="subtle" color="red" size="xs" leftSection={<IconMinus size={12} />}
                      onClick={() => form.removeListItem('tiers', index)}>
                      この区分を削除
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
                <Table.Th style={{ width: 110 }}>数量下限</Table.Th>
                <Table.Th style={{ width: 110 }}>数量上限</Table.Th>
                <Table.Th style={{ width: 110 }} ta="right">原価/本</Table.Th>
                <Table.Th style={{ width: 110 }} ta="right">自動計算単価</Table.Th>
                <Table.Th style={{ width: 140 }}>単価（調整）</Table.Th>
                <Table.Th style={{ width: 110 }} ta="right">採用単価</Table.Th>
                <Table.Th style={{ width: 90 }} ta="right">粗利率</Table.Th>
                <Table.Th style={{ width: 40 }} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {tierRows.map(({ tier: _tier, index, cost, suggested, effective, margin }) => (
                <Table.Tr key={index}>
                  <Table.Td><NumberInput min={1} withAsterisk {...form.getInputProps(`tiers.${index}.minQuantity`)} /></Table.Td>
                  <Table.Td><NumberInput placeholder="上限なし" min={1} {...form.getInputProps(`tiers.${index}.maxQuantity`)} /></Table.Td>
                  <Table.Td><Text size="sm" ta="right" ff="mono">{formatMoney(cost)}</Text></Table.Td>
                  <Table.Td><Text size="sm" ta="right" ff="mono" c="dimmed">{formatMoney(suggested)}</Text></Table.Td>
                  <Table.Td>
                    <NumberInput placeholder="自動" prefix="¥" thousandSeparator="," decimalScale={2} min={0}
                      {...form.getInputProps(`tiers.${index}.priceOverride`)} />
                  </Table.Td>
                  <Table.Td><Text size="sm" ta="right" ff="mono" fw={600}>{formatMoney(effective)}</Text></Table.Td>
                  <Table.Td><Text size="sm" ta="right" ff="mono">{margin.toFixed(1)}%</Text></Table.Td>
                  <Table.Td>
                    <Button variant="subtle" color="red" size="xs" px={4} disabled={form.values.tiers.length === 1}
                      onClick={() => form.removeListItem('tiers', index)} aria-label="この区分を削除">
                      <IconMinus size={14} />
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        <Button variant="subtle" leftSection={<IconPlus size={14} />} mt="sm" size="sm" fullWidth={isMobile}
          onClick={() => {
            const last = form.values.tiers[form.values.tiers.length - 1];
            const nextMin = last?.maxQuantity != null ? last.maxQuantity + 1 : (last?.minQuantity ?? 0) + 100;
            form.insertListItem('tiers', { ...EMPTY_TIER, minQuantity: nextMin });
          }}>
          数量区分を追加
        </Button>

        <Divider mt="sm" />
        <Group justify="flex-end" mt="sm" gap="xs">
          <Text size="sm" c="dimmed">単価範囲</Text>
          <Text fw={700} ff="mono">
            {tierRows.length > 0
              ? `${formatMoney(Math.min(...tierRows.map((t) => t.effective)))} 〜 ${formatMoney(Math.max(...tierRows.map((t) => t.effective)))}`
              : '—'}
          </Text>
        </Group>
      </FormSection>
    </FormShell>
  );
}
