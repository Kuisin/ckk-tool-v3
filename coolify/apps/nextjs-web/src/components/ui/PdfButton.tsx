"use client";

/**
 * PdfButton.tsx — PDF download button (_specs/design.md §10.5).
 *
 * `href` points at an `/api/pdf/...` route; opens in a new tab. Built on the
 * SecondaryButton role from the global button system (buttons.tsx).
 *
 * **`keepInApp` は付けない** — インストールした PWA で PDF をアプリの中に
 * 開くと、ブラウザ内蔵のビューアが画面を占め、アドレスバーも戻るボタンも
 * 無いので前の画面へ戻れなくなる。別ウィンドウ（端末のアプリ内ブラウザ）なら
 * 閉じるだけで元の画面に戻る。理由は `lib/pwa-display.ts`。
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
