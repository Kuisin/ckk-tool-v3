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
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useCallback } from "react";
import type { Locale } from "@/lib/i18n";
import { CancelButton, PrimaryButton } from "./buttons";

/**
 * 命令的な確認ダイアログの既定文言。
 *
 * `openConfirm` は**関数**（イベントハンドラから呼ぶ）なのでフックが使えず、
 * `useTranslations` を中で呼べない。PreferencesProvider の但し書きと同じ扱いで、
 * フックを使えない素の関数へは解決済みの値を**引数で渡す** — ここでは `locale`。
 * 画面からは下の `useConfirm()` を使えば自動で渡る。
 */
const CONFIRM_DEFAULTS = {
  message: {
    ja: "この操作は取り消せません。",
    en: "This cannot be undone.",
    zh: "此操作无法撤销。",
  },
  confirm: { ja: "実行", en: "Run", zh: "执行" },
  cancel: { ja: "戻る", en: "Back", zh: "返回" },
} satisfies Record<string, Record<Locale, string>>;

/**
 * Imperative destructive confirm — wraps `modals.openConfirmModal`
 * exactly per design.md §10.4. Requires <ModalsProvider> (app/providers.tsx).
 *
 * `locale` 省略時は ja。**画面からは `useConfirm()` を使うこと** — こちらを
 * 直に呼ぶと、利用者が英語/中国語でも既定文言が日本語のままになる。
 */
export function openConfirm({
  title,
  message,
  confirmLabel,
  cancelLabel,
  locale = "ja",
  onConfirm,
}: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  locale?: Locale;
  onConfirm: () => void;
}) {
  modals.openConfirmModal({
    title,
    children: (
      <Text size="sm">{message ?? CONFIRM_DEFAULTS.message[locale]}</Text>
    ),
    labels: {
      confirm: confirmLabel ?? CONFIRM_DEFAULTS.confirm[locale],
      cancel: cancelLabel ?? CONFIRM_DEFAULTS.cancel[locale],
    },
    confirmProps: { color: "red" },
    onConfirm,
  });
}

/**
 * 画面から使う `openConfirm`。既定文言が利用者の言語で入る。
 *
 * ```tsx
 * const confirm = useConfirm();
 * confirm({ title: t("deleteTitle"), onConfirm: () => remove(id) });
 * ```
 */
export function useConfirm() {
  const locale = useLocale() as Locale;
  return useCallback(
    (opts: Omit<Parameters<typeof openConfirm>[0], "locale">) =>
      openConfirm({ ...opts, locale }),
    [locale],
  );
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
  confirmLabel,
  confirmColor,
  confirmDisabled,
  cancelLabel,
  loading,
  size = "md",
  hideFooter,
  fullScreen,
}: ModalBaseProps & {
  title: ReactNode;
  children: ReactNode;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmColor?: string;
  /** 入力が揃うまで確定させない（例: 分岐の終端が未選択）。 */
  confirmDisabled?: boolean;
  cancelLabel?: string;
  loading?: boolean;
  size?: ModalSize;
  hideFooter?: boolean;
  /**
   * 画面いっぱいに開く。**ビューア用の逃げ道**で、通常のダイアログでは使わない
   * — モバイルで 70vh の中身（PDF / 3D / 画像）を `size` 指定のモーダルに入れると
   * 本文とフッターが折り返して画面外へ出てしまうため。
   */
  fullScreen?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      centered
      fullScreen={fullScreen}
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
            <CancelButton onClick={onClose}>
              {cancelLabel ?? t("cancel")}
            </CancelButton>
            {onConfirm && (
              <PrimaryButton
                color={confirmColor}
                disabled={confirmDisabled}
                loading={loading}
                onClick={onConfirm}
              >
                {confirmLabel ?? t("run")}
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
  confirmLabel,
  confirmColor = "red",
  loading,
  details,
  warning,
  onConfirm,
}: ModalBaseProps & {
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  confirmColor?: string;
  loading?: boolean;
  /**
   * 本文の下に置く補足（実行すると何が起きるかの内訳など）。message は
   * <Text> の中なので、箇条書きなどブロックを出したいときはこちらへ。
   */
  details?: ReactNode;
  warning?: ReactNode;
  /** Action to run on confirm. The modal closes afterwards (preview default: close only). */
  onConfirm?: () => void;
}) {
  const t = useTranslations("common");
  return (
    <ModalShell
      cancelLabel={t("back")}
      confirmColor={confirmColor}
      confirmLabel={confirmLabel ?? t("run")}
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
      {details}
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
  submitLabel,
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
  const t = useTranslations("common");
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
              {submitLabel ?? t("save")}
            </PrimaryButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
