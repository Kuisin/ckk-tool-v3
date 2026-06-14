// Order matters: globals.css declares the @layer precedence first, then the
// Mantine `.layer.css` variants populate the `mantine` layer (see globals.css).
import "./globals.css";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/notifications/styles.layer.css";

import { mantineHtmlProps } from "@mantine/core";
import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { MANTINE_COLOR_SCHEME_SCRIPT } from "@/lib/mantine-color-scheme-script";
import { Providers } from "./providers";

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CKK 業務管理システム",
  description: "製造業務管理システム — 販売・購買・生産・出荷・請求・マスタ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" {...mantineHtmlProps} className={notoSansJp.variable}>
      <head>
        {/* Server-rendered script — ColorSchemeScript is "use client" and triggers React 19 warnings. */}
        <script
          dangerouslySetInnerHTML={{ __html: MANTINE_COLOR_SCHEME_SCRIPT }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
