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
 * Size is `sm` everywhere via the theme default (design.md §2) — don't pass size.
 * All buttons accept `href` to render as a Next.js <Link>; pass `external` for a
 * new-tab <a>. Every other Mantine Button prop (loading, disabled, fullWidth,
 * onClick, leftSection override …) passes straight through.
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
import type { MouseEventHandler, ReactNode } from "react";

export type AppButtonProps = ButtonProps & {
  /** Render as a Next.js <Link> (internal) or, with `external`, a new-tab <a>. */
  href?: string;
  external?: boolean;
  /** Typed as HTMLElement so it satisfies both <button> and <a>/<Link> renders. */
  onClick?: MouseEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
  "aria-label"?: string;
  children?: ReactNode;
};

/** Internal: resolves `href`/`external` to the right polymorphic Button. */
function BaseButton({ href, external, children, ...props }: AppButtonProps) {
  if (href && external) {
    return (
      <Button
        component="a"
        href={href}
        rel="noopener noreferrer"
        target="_blank"
        {...props}
      >
        {children}
      </Button>
    );
  }
  if (href) {
    return (
      <Button component={Link} href={href} {...props}>
        {children}
      </Button>
    );
  }
  return <Button {...props}>{children}</Button>;
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
  return (
    <PrimaryButton
      leftSection={<IconDeviceFloppy size={16} />}
      type="submit"
      {...props}
    >
      {children ?? "保存"}
    </PrimaryButton>
  );
}

export function CancelButton({ children, ...props }: AppButtonProps) {
  return (
    <SecondaryButton {...props}>{children ?? "キャンセル"}</SecondaryButton>
  );
}

export function CreateButton({ children, ...props }: AppButtonProps) {
  return (
    <PrimaryButton leftSection={<IconPlus size={16} />} {...props}>
      {children ?? "新規作成"}
    </PrimaryButton>
  );
}

export function EditButton({ children, ...props }: AppButtonProps) {
  return (
    <SecondaryButton leftSection={<IconEdit size={14} />} {...props}>
      {children ?? "編集"}
    </SecondaryButton>
  );
}

export function CopyButton({ children, ...props }: AppButtonProps) {
  return (
    <SecondaryButton leftSection={<IconCopy size={14} />} {...props}>
      {children ?? "複製"}
    </SecondaryButton>
  );
}

export function DeleteButton({ children, ...props }: AppButtonProps) {
  return (
    <DangerButton leftSection={<IconTrash size={14} />} {...props}>
      {children ?? "削除"}
    </DangerButton>
  );
}

export function ApproveButton({ children, ...props }: AppButtonProps) {
  return (
    <PrimaryButton
      color="green"
      leftSection={<IconCheck size={16} />}
      {...props}
    >
      {children ?? "承認"}
    </PrimaryButton>
  );
}

export function RejectButton({ children, ...props }: AppButtonProps) {
  return (
    <BaseButton
      color="red"
      leftSection={<IconArrowBackUp size={16} />}
      variant="outline"
      {...props}
    >
      {children ?? "差し戻し"}
    </BaseButton>
  );
}
