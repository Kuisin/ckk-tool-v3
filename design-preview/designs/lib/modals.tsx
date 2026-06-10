/**
 * modals.tsx — Unified popup scaffolds for the `_modals/` designs.
 *
 * Every actionable popup (confirm / quick-create / status-change / approve /
 * upload / assign …) is a controlled component built on one of these scaffolds,
 * so dialog chrome, footer buttons, and destructive styling stay consistent
 * (design.md §10.4, §16.2). In production these map to `@mantine/modals`.
 *
 *   ModalShell   — titled Modal + footer (cancel / confirm)
 *   ConfirmModal — destructive confirm (red), short message
 *   FormModal    — Modal wrapping a <form> with submit/cancel footer
 */

import { type ReactNode } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

export interface ModalBaseProps {
  opened: boolean;
  onClose: () => void;
}

type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// ── ModalShell ───────────────────────────────────────────────────────────────
export function ModalShell({
  opened,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = '実行',
  confirmColor,
  cancelLabel = 'キャンセル',
  loading,
  size = 'md',
  hideFooter,
}: ModalBaseProps & {
  title: ReactNode;
  children: ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmColor?: string;
  cancelLabel?: string;
  loading?: boolean;
  size?: ModalSize;
  hideFooter?: boolean;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} size={size} centered withinPortal>
      <Stack gap="md">
        {children}
        {!hideFooter && (
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" onClick={onClose}>{cancelLabel}</Button>
            {onConfirm && (
              <Button color={confirmColor} loading={loading} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            )}
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

// ── ConfirmModal (destructive) ────────────────────────────────────────────────
export function ConfirmModal({
  opened,
  onClose,
  title,
  message,
  confirmLabel = '実行',
  confirmColor = 'red',
  loading,
  warning,
  onConfirm,
}: ModalBaseProps & {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  warning?: ReactNode;
  /** Action to run on confirm. The modal closes afterwards (preview default: close only). */
  onConfirm?: () => void;
}) {
  return (
    <ModalShell
      opened={opened}
      onClose={onClose}
      title={title}
      onConfirm={() => {
        onConfirm?.();
        onClose();
      }}
      confirmLabel={confirmLabel}
      confirmColor={confirmColor}
      cancelLabel="戻る"
      loading={loading}
      size="sm"
    >
      <Text size="sm">{message}</Text>
      {warning && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          {warning}
        </Alert>
      )}
    </ModalShell>
  );
}

// ── FormModal ─────────────────────────────────────────────────────────────────
export function FormModal({
  opened,
  onClose,
  title,
  children,
  onSubmit,
  submitLabel = '保存',
  loading,
  size = 'lg',
}: ModalBaseProps & {
  title: ReactNode;
  children: ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  loading?: boolean;
  size?: ModalSize;
}) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} size={size} centered withinPortal>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {children}
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" onClick={onClose}>キャンセル</Button>
            <Button type="submit" loading={loading}>{submitLabel}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
