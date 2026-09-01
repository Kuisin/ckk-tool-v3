"use client";

/**
 * buttons.tsx — Global button design system (_specs/design.md §11).
 *
 * One source of truth for every button in the app. Two layers:
 *
 *   1. Role buttons — map design.md §11 variants to named components:
 *        PrimaryButton   filled            (primary CTA)
 *        SecondaryButton default           (secondary)
 *        GhostButton     subtle            (tertiary / ghost)
 *        DangerButton    filled red        (destructive CTA)
 *
 *   2. Action buttons — recurring actions with label + icon + role baked in:
 *        SaveButton CancelButton EditButton DeleteButton CreateButton
 *        CopyButton ApproveButton RejectButton  (PdfButton lives in PdfButton.tsx)
 *
 * Size is `compact-md` with sm text via CSS vars — override via `size` only when needed.
 * All buttons accept `href` to render as a Next.js <Link>; pass `external` for a
 * new-tab <a> (add `keepInApp` when that target is an app screen — see
 * `lib/pwa-display.ts`). Every other Mantine Button prop (loading, disabled,
 * fullWidth, onClick, leftSection override …) passes straight through.
 */

import { Button, type ButtonProps } from "@mantine/core";
import {
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconDeviceFloppy,
  IconEdit,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MouseEventHandler, ReactNode } from "react";
import { keepInAppOnClick } from "@/lib/pwa-display";

export type AppButtonProps = ButtonProps & {
  /** Render as a Next.js <Link> (internal) or, with `external`, a new-tab <a>. */
  href?: string;
  external?: boolean;
  /**
   * `external` の行き先が**アプリの画面**のとき（自前のナビゲーションを持つ）
   * だけ true。インストールした PWA でアプリの中に留める。
   *
   * 既定 (false) は新しいブラウジングコンテキスト = 端末のアプリ内ブラウザ /
   * 別ウィンドウ。PDF・保管ファイル・外部サイトはこちら — 同じウィンドウに
   * 出すと戻る手段が無くなる（`lib/pwa-display.ts` の WHY）。
   */
  keepInApp?: boolean;
  /** Typed as HTMLElement so it satisfies both <button> and <a>/<Link> renders. */
  onClick?: MouseEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
  children?: ReactNode;
};

/** Slim buttons: compact-md height/padding with sm text (Mantine has no `textSize` prop). */
const baseButtonDefaults = {
  size: "compact-md",
  styles: {
    root: {
      fontSize: "var(--mantine-font-size-xs)",
    },
  },
} satisfies Partial<ButtonProps>;

/** Internal: resolves `href`/`external` to the right polymorphic Button. */
function BaseButton({
  href,
  external,
  keepInApp,
  children,
  ...props
}: AppButtonProps) {
  if (href && external) {
    return (
      <Button
        component="a"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        {...baseButtonDefaults}
        {...props}
        // 既定は target="_blank" のまま端末に任せる（アプリ内ブラウザ /
        // 別ウィンドウ）。アプリの画面へ行くリンクだけ keepInApp でアプリの
        // 中に留める — 判定と理由は lib/pwa-display.ts に寄せてある。
        onClick={(e) => {
          if (keepInApp) keepInAppOnClick(e, href);
          props.onClick?.(e);
        }}
      >
        {children}
      </Button>
    );
  }
  if (href) {
    return (
      <Button component={Link} href={href} {...baseButtonDefaults} {...props}>
        {children}
      </Button>
    );
  }
  return (
    <Button {...baseButtonDefaults} {...props}>
      {children}
    </Button>
  );
}

// ── Role buttons ─────────────────────────────────────────────────────────────
export function PrimaryButton(props: AppButtonProps) {
  return <BaseButton variant="filled" {...props} />;
}

export function SecondaryButton(props: AppButtonProps) {
  return <BaseButton variant="default" {...props} />;
}

export function GhostButton(props: AppButtonProps) {
  return <BaseButton variant="subtle" {...props} />;
}

export function DangerButton(props: AppButtonProps) {
  return <BaseButton color="red" variant="filled" {...props} />;
}

// ── Action buttons ───────────────────────────────────────────────────────────
export function SaveButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <PrimaryButton
      leftSection={<IconDeviceFloppy size={16} />}
      type="submit"
      {...props}
    >
      {children ?? t("save")}
    </PrimaryButton>
  );
}

export function CancelButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <SecondaryButton {...props}>{children ?? t("cancel")}</SecondaryButton>
  );
}

export function CreateButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <PrimaryButton leftSection={<IconPlus size={16} />} {...props}>
      {children ?? t("create")}
    </PrimaryButton>
  );
}

export function EditButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <SecondaryButton leftSection={<IconEdit size={14} />} {...props}>
      {children ?? t("edit")}
    </SecondaryButton>
  );
}

export function CopyButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <SecondaryButton leftSection={<IconCopy size={14} />} {...props}>
      {children ?? t("copy")}
    </SecondaryButton>
  );
}

export function DeleteButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <DangerButton leftSection={<IconTrash size={14} />} {...props}>
      {children ?? t("delete")}
    </DangerButton>
  );
}

export function ApproveButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <PrimaryButton
      color="green"
      leftSection={<IconCheck size={16} />}
      {...props}
    >
      {children ?? t("approve")}
    </PrimaryButton>
  );
}

export function RejectButton({ children, ...props }: AppButtonProps) {
  const t = useTranslations("common");
  return (
    <BaseButton
      color="red"
      leftSection={<IconArrowBackUp size={16} />}
      variant="outline"
      {...props}
    >
      {children ?? t("reject")}
    </BaseButton>
  );
}
