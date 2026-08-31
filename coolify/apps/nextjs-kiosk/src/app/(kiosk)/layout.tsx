import { DevicePresence } from "@/components/DevicePresence";
import { KioskShell } from "@/components/KioskShell";
import { LastPageTracker } from "@/components/LastPageTracker";
import { LocationReporter } from "@/components/LocationReporter";
import { getDevice, getSession } from "@/lib/kiosk-auth";

/**
 * (kiosk) レイアウト — 共有タブレットの画面まわり（ヘッダー・フッター・
 * プレゼンス・GPS 報告・最終ページ記録）。
 *
 * ルートレイアウトから分けているのは、同じアプリに居る管理ディスプレイ
 * （/display）がこの一式を**まったく必要としない**ため。ルート直下に置くと、
 * 壁掛けテレビにも電池残量と端末名が出て、隠し端末設定の 5 タップまで
 * 効いてしまう。URL はグループ名を含まないので、既存のパスは変わらない。
 */
export default async function KioskLayout({
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

  // ログイン中の利用者名をヘッダー左に出す（未ログインは null＝非表示）。
  // getSession は読み取りのみ（期限切れセッションの失効だけは書く）で
  // lastActivityAt には触らないので、ここで呼んでも滞留時間は伸びない。
  let userName: string | null = null;
  try {
    userName = (await getSession())?.displayName ?? null;
  } catch {
    // 端末名と同じくビルド時・DB 不通時は出さないだけ
  }

  return (
    <>
      {/* 登録済み端末はログイン前でも WS 接続を保持（プレゼンス）+ GPS 報告 */}
      {registered && <DevicePresence />}
      {registered && <LocationReporter />}
      <LastPageTracker />

      <KioskShell
        deviceName={deviceName}
        registered={registered}
        userName={userName}
      >
        {children}
      </KioskShell>
    </>
  );
}
