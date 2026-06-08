/**
 * copy.tsx — 受注書 コピーして新規作成ポップアップ
 *
 * Controlled modal: pick what to carry over to the new sales order.
 * Built on the unified ModalShell scaffold (lib/modals).
 */

import { useState } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function CopySalesOrderModal({
  opened,
  onClose,
  salesOrderNumber,
}: ModalBaseProps & { salesOrderNumber: string }) {
  const [copyItems, setCopyItems] = useState(true);
  const [copyEndUser, setCopyEndUser] = useState(true);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="コピーして新規作成"
      confirmLabel="コピーして作成"
      confirmColor="blue"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        受注書「{salesOrderNumber}」の内容を引き継いで新しい受注書を作成します。
      </Text>
      <Stack gap="xs">
        <Checkbox
          label="製品・数量・単価を引き継ぐ"
          checked={copyItems}
          onChange={(e) => setCopyItems(e.currentTarget.checked)}
        />
        <Checkbox
          label="最終需要家を引き継ぐ"
          checked={copyEndUser}
          onChange={(e) => setCopyEndUser(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
