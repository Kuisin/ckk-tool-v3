/**
 * complete.tsx — 設計依頼書 完了ポップアップ（→ COMPLETED ＋ 製品へ反映）
 *
 * Controlled modal: mark the design request complete and optionally attach the
 * latest design file to the product master. Built on the ModalShell scaffold.
 */

import { useState } from 'react';
import { Checkbox, Stack, Text } from '@mantine/core';
import { ModalShell, type ModalBaseProps } from '../../../lib/modals';

export function CompleteDesignRequestModal({
  opened,
  onClose,
  requestNumber,
  productName,
}: ModalBaseProps & { requestNumber: string; productName: string }) {
  const [applyToProduct, setApplyToProduct] = useState(true);

  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title="設計依頼書の完了"
      confirmLabel="完了にする"
      confirmColor="green"
      onConfirm={onClose}
      size="sm"
    >
      <Text size="sm">
        設計依頼書「{requestNumber}」を完了にします。
      </Text>
      <Stack gap="xs">
        <Checkbox
          label={`最新の設計図を製品「${productName}」に反映する`}
          checked={applyToProduct}
          onChange={(e) => setApplyToProduct(e.currentTarget.checked)}
        />
      </Stack>
    </ModalShell>
  );
}
