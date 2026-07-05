'use client';

import { useState } from 'react';
import { Group, Stack, Table, Tabs, Text } from '@mantine/core';
import { IconCopy, IconCurrencyYen, IconTrash } from '@tabler/icons-react';
import { DocNumber, FieldValue, formatDateTime, formatMoney, MoneyText } from '../../lib/ui';
import { StatusBadge } from '../../lib/status';
import {
  AuditTimeline,
  DetailShell,
  ResourceActions,
  SummaryGrid,
  type AuditEntry,
} from '../../lib/shells';
import { ORDER_TYPE_LABEL } from '../../lib/mock';
import { useIsMobile } from '../../lib/viewport-context';
import {
  type CostInputs,
  grossMarginRate,
  quantityRangeLabel,
  tierUnitCost,
} from './_calc';
import { RegisterPriceListModal } from './_modals/register-price-list';

// ── Mock: EST-202606-00015（確定済・価格表未登録） ─────────────────────────
const MOCK = {
  estimateNumber: 'EST-202606-00015',
  status: 'CONFIRMED',
  customerName: '合同会社XYZ工業',
  productName: 'ロッド PRD-2602-0008',
  orderType: 'PRODUCTION',
  materialName: 'A02B0014-B001-002 — SKD11 φ32×2500（定尺）',
  notes: 'コーティングは中央コーティング工業へ外注前提。',
  createdBy: '鈴木 一郎',
  createdAt: '2026-06-01 10:20',
  updatedAt: '2026-06-05 16:45',
};

const MOCK_COSTS: CostInputs = {
  materialUnitCost: 1800,
  machiningMinutes: 24,
  machiningRate: 4800,
  outsourceCost: 650,
  setupCost: 24000,
  marginRate: 30,
};

const MOCK_TIERS = [
  { minQuantity: 50, maxQuantity: 199 as number | null, unitPrice: 6960 },
  { minQuantity: 200, maxQuantity: null as number | null, unitPrice: 6200 },
];

const MOCK_AUDIT: AuditEntry[] = [
  { id: 1, action: 'UPDATE', user: '鈴木', at: '2026-06-05 16:45', detail: 'ステータス: DRAFT → CONFIRMED' },
  { id: 2, action: 'UPDATE', user: '鈴木', at: '2026-06-03 11:05', detail: '外注費: ¥600 → ¥650' },
  { id: 3, action: 'CREATE', user: '鈴木', at: '2026-06-01 10:20', detail: '試算を作成' },
];

// 原価内訳（表示用）
const COST_BREAKDOWN = [
  { label: '材料費（/本）', value: MOCK_COSTS.materialUnitCost },
  { label: `加工費（/本）: ${MOCK_COSTS.machiningMinutes}分 × ¥${MOCK_COSTS.machiningRate.toLocaleString()}/時`, value: (MOCK_COSTS.machiningMinutes / 60) * MOCK_COSTS.machiningRate },
  { label: '外注費（/本）', value: MOCK_COSTS.outsourceCost },
  { label: '段取り費（固定・下限本数で按分）', value: MOCK_COSTS.setupCost },
];

export default function EstimateDetailPage() {
  const isMobile = useIsMobile();
  const e = MOCK;
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <DetailShell
      breadcrumbs={['ホーム', '販売', '試算', e.estimateNumber]}
      title={e.estimateNumber}
      status={<StatusBadge entity="Estimate" status={e.status} />}
      createdAt={formatDateTime(e.createdAt)}
      updatedAt={formatDateTime(e.updatedAt)}
      actions={
        <ResourceActions
          onEdit={() => {}}
          menuItems={[
            { label: '価格表に登録', icon: <IconCurrencyYen size={14} />, onClick: () => setRegisterOpen(true) },
            { label: '複製して再試算', icon: <IconCopy size={14} /> },
            { label: '削除', icon: <IconTrash size={14} />, color: 'red', divider: true },
          ]}
        />
      }
    >
      <SummaryGrid>
        <FieldValue label="試算番号" value={<DocNumber>{e.estimateNumber}</DocNumber>} />
        <FieldValue label="顧客" value={e.customerName} />
        <FieldValue label="製品" value={e.productName} />
        <FieldValue label="注文種別" value={ORDER_TYPE_LABEL[e.orderType]} />
        <FieldValue label="素材" value={e.materialName} />
        <FieldValue label="利益率" value={`${MOCK_COSTS.marginRate}%`} />
        <FieldValue label="作成者" value={e.createdBy} />
        <FieldValue label="備考" value={e.notes} />
      </SummaryGrid>

      <Tabs defaultValue="calc">
        <Tabs.List>
          <Tabs.Tab value="calc">計算内訳</Tabs.Tab>
          <Tabs.Tab value="related">関連</Tabs.Tab>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="calc" pt="md">
          <Stack gap="md">
            {/* 原価要素 */}
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>原価要素</Table.Th>
                  <Table.Th ta="right">金額</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {COST_BREAKDOWN.map((c) => (
                  <Table.Tr key={c.label}>
                    <Table.Td>{c.label}</Table.Td>
                    <Table.Td><MoneyText value={c.value} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>

            {/* 数量区分別の計算結果 */}
            <Table withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>数量範囲</Table.Th>
                  <Table.Th ta="right">原価/本</Table.Th>
                  <Table.Th ta="right">単価</Table.Th>
                  {!isMobile && <Table.Th ta="right">粗利率</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {MOCK_TIERS.map((t, i) => {
                  const cost = tierUnitCost(MOCK_COSTS, t.minQuantity);
                  return (
                    <Table.Tr key={i}>
                      <Table.Td>{quantityRangeLabel(t.minQuantity, t.maxQuantity)}</Table.Td>
                      <Table.Td><MoneyText value={cost} /></Table.Td>
                      <Table.Td><Text size="sm" ta="right" ff="mono" fw={600}>{formatMoney(t.unitPrice)}</Text></Table.Td>
                      {!isMobile && (
                        <Table.Td>
                          <Text size="sm" ta="right" ff="mono">{grossMarginRate(t.unitPrice, cost).toFixed(1)}%</Text>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
            <Text size="xs" c="dimmed">
              単価 = 原価 ÷ (1 − 利益率)（10円単位切り上げ、調整単価があれば優先）。段取り費は数量区分の下限本数で按分。
            </Text>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="related" pt="md">
          <Stack gap="xs">
            <Group>
              <Text size="sm" c="dimmed" w={120}>価格表</Text>
              <Text size="sm" c="dimmed">未登録 — 「価格表に登録」で数量区分ごとの価格表行を作成します</Text>
            </Group>
            <Group>
              <Text size="sm" c="dimmed" w={120}>見積書</Text>
              <Text size="sm" c="dimmed">—（価格表登録後に作成可能）</Text>
            </Group>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <AuditTimeline entries={MOCK_AUDIT} />
        </Tabs.Panel>
      </Tabs>

      <RegisterPriceListModal
        opened={registerOpen}
        onClose={() => setRegisterOpen(false)}
        estimateNumber={e.estimateNumber}
        customerName={e.customerName}
        productName={e.productName}
        tiers={MOCK_TIERS}
      />
    </DetailShell>
  );
}
