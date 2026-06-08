import {
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Timeline,
} from '@mantine/core';
import {
  FieldValue,
  formatDate,
  formatDateTime,
  PageHeader,
} from '../../lib/ui';
import { useIsMobile } from '../../lib/viewport-context';

// ── Mock data ────────────────────────────────────────────────────────────────
const RECEIPT = {
  materialCode: 'A01A0001-A001-001',
  materialName: 'SUS303 φ20×3000（研磨）',
  supplierName: '山陽素材商事',
  quantity: 100,
  unit: '本',
  receivedAt: '2026-05-28',
  notes: '検収済み。ミルシート添付。',
  createdBy: '田中 太郎',
  createdAt: '2026-05-28 14:30',
};

const AUDIT = [
  { id: 1, action: 'UPDATE', user: '田中 太郎', at: '2026-05-28 14:35', detail: '素材在庫へ入庫（+100 本）' },
  { id: 2, action: 'CREATE', user: '田中 太郎', at: '2026-05-28 14:30', detail: '素材入荷を登録' },
];

export default function MaterialReceiptDetailPage() {
  const isMobile = useIsMobile();

  return (
    <Stack gap="md">
      <PageHeader
        breadcrumbs={['ホーム', '購買', '素材入荷', RECEIPT.materialCode]}
        title={RECEIPT.materialName}
        align="flex-start"
      />

      {/* Summary */}
      <Paper withBorder p="md" radius="md">
        <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
          <FieldValue
            label="素材コード"
            value={<Text size="sm" ff="mono">{RECEIPT.materialCode}</Text>}
          />
          <FieldValue label="素材" value={RECEIPT.materialName} />
          <FieldValue label="仕入先" value={RECEIPT.supplierName} />
          <FieldValue label="数量" value={`${RECEIPT.quantity} ${RECEIPT.unit}`} />
          <FieldValue label="入荷日" value={formatDate(RECEIPT.receivedAt)} />
          <FieldValue label="備考" value={RECEIPT.notes} />
        </SimpleGrid>
        {isMobile && (
          <Group gap="xl" mt="sm">
            <Text size="xs" c="dimmed">
              登録: {formatDateTime(RECEIPT.createdAt)}（{RECEIPT.createdBy}）
            </Text>
          </Group>
        )}
      </Paper>

      {/* Tabs */}
      <Tabs defaultValue="history">
        <Tabs.List>
          <Tabs.Tab value="history">履歴</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="history" pt="md">
          <Timeline active={-1} bulletSize={28} lineWidth={2}>
            {AUDIT.map((log) => (
              <Timeline.Item
                key={log.id}
                bullet={
                  <Text size="xs" fw={700}>
                    {log.user[0]}
                  </Text>
                }
                title={log.action}
              >
                <Text size="xs" c="dimmed">
                  {formatDateTime(log.at)} · {log.user}
                </Text>
                <Text size="sm" mt={4}>
                  {log.detail}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Tabs.Panel>
      </Tabs>

      {!isMobile && (
        <>
          <Divider />
          <Group gap="xl">
            <Text size="xs" c="dimmed">
              登録: {formatDateTime(RECEIPT.createdAt)}（{RECEIPT.createdBy}）
            </Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
