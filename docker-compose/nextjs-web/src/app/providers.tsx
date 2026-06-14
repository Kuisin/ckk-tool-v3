"use client";

/**
 * providers.tsx — Client-side provider stack.
 *
 * MantineProvider (theme) + ModalsProvider (confirm dialogs, design.md §10.4)
 * + Notifications (toasts, design.md §16.1). Kept in a 'use client' file so the
 * theme object (contains component extensions) never crosses the RSC boundary.
 */

import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "dayjs/locale/ja";
import type { ReactNode } from "react";
import { theme } from "./theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider defaultColorScheme="light" theme={theme}>
      <DatesProvider settings={{ locale: "ja", firstDayOfWeek: 0 }}>
        <ModalsProvider>
          <Notifications position="top-right" />
          {children}
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
