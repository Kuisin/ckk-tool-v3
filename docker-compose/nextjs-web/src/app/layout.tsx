// Order matters: globals.css declares the @layer precedence first, then the
// Mantine `.layer.css` variants populate the `mantine` layer (see globals.css).
import "./globals.css";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/notifications/styles.layer.css";

import { mantineHtmlProps } from "@mantine/core";
import type { Metadata, Viewport } from "next";
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
  // PWA: manifest は app/manifest.ts が /manifest.webmanifest として配信。
  // iOS はホーム画面追加（スタンドアロン）で Web Push が有効になる（16.4+）。
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: {
    capable: true,
    title: "CKK",
    statusBarStyle: "default",
  },
};

// モバイル PWA: input フォーカス時の自動ズームを抑止（iOS は font-size <16px の
// 入力にフォーカスすると拡大する）。maximum-scale=1 で抑止しつつ、iOS 10+ は
// ピンチズーム自体は引き続き可能（アクセシビリティを損なわない）。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" {...mantineHtmlProps} className={notoSansJp.variable}>
      <head>
        {/* Server-rendered script — ColorSchemeScript is "use client" and triggers React 19 warnings.
            noDangerouslySetInnerHtml is disabled for this file in biome.json:
            the content is a static in-repo constant (Mantine color-scheme bootstrap), no user input. */}
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
