/**
 * confirm.tsx — 受注書 確定ポップアップ（DRAFT → CONFIRMED）
 *
 * Controlled modal opened from the sales-order detail action menu.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { useState } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function ConfirmSalesOrderModal({
  opened,
  onClose,
  salesOrderNumber,
}: ModalBaseProps & { salesOrderNumber: string }) {
  const [autoLot, setAutoLot] = useState(true);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="受注書の確定"
      confirmLabel="確定"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        受注書「{salesOrderNumber}」を確定します。確定後は指示書の作成が可能になります。
      </Text>
      <Stack gap="xs">
        <Checkbox
          label="ロット番号を自動採番する（通し連番）"
          checked={autoLot}
          onChange={(e) => setAutoLot(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
