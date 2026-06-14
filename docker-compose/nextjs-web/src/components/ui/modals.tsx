"use client";

/**
 * modals.tsx — Unified popup scaffolds for actionable dialogs.
 *
 * Every actionable popup (confirm / quick-create / status-change / approve /
 * upload / assign …) is a controlled component built on one of these scaffolds,
 * so dialog chrome, footer buttons, and destructive styling stay consistent
 * (design.md §10.4, §16.2).
 *
 *   ModalShell   — titled Modal + footer (cancel / confirm)
 *   ConfirmModal — destructive confirm (red), short message
 *   FormModal    — Modal wrapping a <form> with submit/cancel footer
 *   openConfirm  — imperative confirm via @mantine/modals (design.md §10.4)
 */

import { Alert, Group, Modal, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconAlertTriangle } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { CancelButton, PrimaryButton } from "./buttons";

/**
 * Imperative destructive confirm — wraps `modals.openConfirmModal`
 * exactly per design.md §10.4. Requires <ModalsProvider> (app/providers.tsx).
 */
export function openConfirm({
  title,
  message = "この操作は取り消せません。",
  confirmLabel = "実行",
  onConfirm,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  modals.openConfirmModal({
    title,
    children: <Text size="sm">{message}</Text>,
    labels: { confirm: confirmLabel, cancel: "戻る" },
    confirmProps: { color: "red" },
    onConfirm,
  });
}

export interface ModalBaseProps {
  opened: boolean;
  onClose: () => void;
}

type ModalSize = "xs" | "sm" | "md" | "lg" | "xl";

// ── ModalShell ───────────────────────────────────────────────────────────────
export function ModalShell({
  opened,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = "実行",
  confirmColor,
  cancelLabel = "キャンセル",
  loading,
  size = "md",
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
    <Modal
      centered
      onClose={onClose}
      opened={opened}
      size={size}
      title={title}
      withinPortal
    >
      <Stack gap="md">
        {children}
        {!hideFooter && (
          <Group gap="xs" justify="flex-end" mt="xs">
            <CancelButton onClick={onClose}>{cancelLabel}</CancelButton>
            {onConfirm && (
              <PrimaryButton
                color={confirmColor}
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel}
              </PrimaryButton>
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
  confirmLabel = "実行",
  confirmColor = "red",
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
      cancelLabel="戻る"
      confirmColor={confirmColor}
      confirmLabel={confirmLabel}
      loading={loading}
      onClose={onClose}
      onConfirm={() => {
        onConfirm?.();
        onClose();
      }}
      opened={opened}
      size="sm"
      title={title}
    >
      <Text size="sm">{message}</Text>
      {warning && (
        <Alert
          color="red"
          icon={<IconAlertTriangle size={16} />}
          variant="light"
        >
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
  submitLabel = "保存",
  loading,
  size = "lg",
}: ModalBaseProps & {
  title: ReactNode;
  children: ReactNode;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  loading?: boolean;
  size?: ModalSize;
}) {
  return (
    <Modal
      centered
      onClose={onClose}
      opened={opened}
      size={size}
      title={title}
      withinPortal
    >
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {children}
          <Group gap="xs" justify="flex-end" mt="xs">
            <CancelButton onClick={onClose} />
            <PrimaryButton loading={loading} type="submit">
              {submitLabel}
            </PrimaryButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
