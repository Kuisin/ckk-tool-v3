import "./globals.css";
import "@mantine/core/styles.layer.css";
import "@mantine/notifications/styles.layer.css";

import { mantineHtmlProps } from "@mantine/core";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { DevicePresence } from "@/components/DevicePresence";
import { KioskShell } from "@/components/KioskShell";
import { LastPageTracker } from "@/components/LastPageTracker";
import { LocationReporter } from "@/components/LocationReporter";
import { getDevice } from "@/lib/kiosk-auth";
import { Providers } from "./providers";

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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 端末名をヘッダーに常時表示（未登録/ビルド時は「未登録端末」表示）。
  // skipAttest: アテスト前の画面（/setup, /login 初期）でも名前は出す。
  let deviceName: string | null = null;
  let registered = false;
  try {
    const device = await getDevice({ skipAttest: true });
    if (device.ok) {
      deviceName = device.device.name;
      registered = true;
    }
  } catch {
    // ビルド時（request scope 外）や DB 不通時はヘッダーだけ既定表示
  }

  return (
    <html lang="ja" {...mantineHtmlProps} className={notoSansJp.variable}>
      <body>
        <Providers>
          {/* 登録済み端末はログイン前でも WS 接続を保持（プレゼンス）+ GPS 報告 */}
          {registered && <DevicePresence />}
          {registered && <LocationReporter />}
          <LastPageTracker />

          <KioskShell deviceName={deviceName} registered={registered}>
            {children}
          </KioskShell>
        </Providers>
      </body>
    </html>
  );
}
