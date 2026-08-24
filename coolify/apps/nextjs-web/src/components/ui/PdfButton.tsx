"use client";

/**
 * PdfButton.tsx — PDF download button (_specs/design.md §10.5).
 *
 * `href` points at an `/api/pdf/...` route; opens in a new tab. Built on the
 * SecondaryButton role from the global button system (buttons.tsx).
 */

import { IconFileTypePdf } from "@tabler/icons-react";
import { SecondaryButton } from "./buttons";

export function PdfButton({ href, label }: { href: string; label?: string }) {
  return (
    <SecondaryButton
      external
      href={href}
      leftSection={<IconFileTypePdf size={16} />}
    >
      {label ?? "PDF"}
    </SecondaryButton>
  );
}
