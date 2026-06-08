/**
 * price-diff.tsx — 価格差異の再調整ポップアップ
 *
 * Controlled modal: resolve a 価格差異（PRICE_DIFF）注文受諾書 — either re-adjust
 * the price (single price field) or send the related quote back for rework.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { useState } from 'react';
import { NumberInput, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function PriceDiffModal({
  opened,
  onClose,
  orderNumber,
  quotedTotal,
  orderedTotal,
}: ModalBaseProps & { orderNumber: string; quotedTotal: number; orderedTotal: number }) {
  const [mode, setMode] = useState<'readjust' | 'reject'>('readjust');
  const [newTotal, setNewTotal] = useState<number | string>(orderedTotal);
  const [reason, setReason] = useState('');

  const fmt = (v: number) =>
    new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(v);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="価格差異の再調整"
      confirmLabel={mode === 'readjust' ? '再調整して確定' : '見積へ差し戻し'}
      confirmColor={mode === 'readjust' ? 'blue' : 'orange'}
      onConfirm={onClose}
      size="md"
    >
      <Text size="sm">
        注文受諾書「{orderNumber}」の価格差異を処理します。
      </Text>
      <Stack gap={4}>
        <Text size="xs" c="dimmed">見積金額: {fmt(quotedTotal)}</Text>
        <Text size="xs" c="dimmed">注文書金額: {fmt(orderedTotal)}</Text>
      </Stack>
      <SegmentedControl
        fullWidth
        value={mode}
        onChange={(v) => setMode(v as 'readjust' | 'reject')}
        data={[
          { value: 'readjust', label: '価格を再調整' },
          { value: 'reject', label: '見積へ差し戻し' },
        ]}
      />
      {mode === 'readjust' ? (
        <NumberInput
          label="調整後の合計金額"
          prefix="¥"
          thousandSeparator=","
          decimalScale={2}
          min={0}
          value={newTotal}
          onChange={setNewTotal}
        />
      ) : (
        <Textarea
          label="差し戻し理由"
          placeholder="差し戻しの理由を入力してください"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      )}
    </ModalShell>
  );
}
