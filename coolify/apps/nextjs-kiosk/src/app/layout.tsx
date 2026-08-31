import "./globals.css";
import "@mantine/core/styles.layer.css";
import "@mantine/notifications/styles.layer.css";

import { mantineHtmlProps } from "@mantine/core";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { Providers } from "./providers";

/**
 * ルートレイアウト — html / body / フォント / Mantine のみ。
 *
 * 画面まわり（ヘッダー・フッター・プレゼンス）は **(kiosk) グループの
 * レイアウト**が持つ。分けているのは、管理ディスプレイ（/display）が
 * 同じアプリに同居しながら**まったく別の見た目**だから:
 * 壁掛けテレビに「電池残量」も「端末名」も要らないし、隠し端末設定の
 * 5 タップが効いてしまうと、誰でも触れる場所からキオスクの設定に入れる。
 */

const notoSansJp = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CKK 専用端末",
  description: "共有キオスク端末 — QR コードでログイン",
};

// タブレット全画面運用: 入力フォーカス時の自動ズーム抑止（nextjs-web と同じ）。
// themeColor はダークテーマ固定に合わせて濃紺（theme.ts dark[7] = body 背景）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#21243b",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" {...mantineHtmlProps} className={notoSansJp.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
