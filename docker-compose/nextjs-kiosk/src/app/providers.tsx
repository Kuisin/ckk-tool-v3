"use client";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { ReactNode } from "react";
import { theme } from "./theme";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // キオスクはダークネイビー固定（theme.ts 参照）— web アプリとの識別用
    <MantineProvider forceColorScheme="dark" theme={theme}>
      <Notifications position="top-center" />
      {children}
    </MantineProvider>
  );
}
