import { DevicePresence } from "@/components/DevicePresence";
import { I18nProvider } from "@/components/I18nProvider";
import { KioskShell } from "@/components/KioskShell";
import { LastPageTracker } from "@/components/LastPageTracker";
import { LocationReporter } from "@/components/LocationReporter";
import { prisma } from "@/lib/db";
import { getDeviceDefaultWorkLocationLabel } from "@/lib/device-work-location";
import type { Locale } from "@/lib/i18n";
import { getDevice, getSession } from "@/lib/kiosk-auth";
import {
  DEFAULT_TEXT_SCALE,
  normalizeTextScale,
  type TextScale,
  textScaleRootCss,
} from "@/lib/text-scale";

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
  let deviceId: string | null = null;
  let registered = false;
  let deviceLocale: Locale = "ja";
  try {
    const device = await getDevice({ skipAttest: true });
    if (device.ok) {
      deviceName = device.device.name;
      deviceId = device.device.id;
      deviceLocale = device.device.locale;
      registered = true;
    }
  } catch {
    // ビルド時（request scope 外）や DB 不通時はヘッダーだけ既定表示
  }

  // ログイン中の利用者名をヘッダー左に出す（未ログインは null＝非表示）。
  // getSession は読み取りのみ（期限切れセッションの失効だけは書く）で
  // lastActivityAt には触らないので、ここで呼んでも滞留時間は伸びない。
  // ログイン中の利用者名 + 文字の大きさ。大きさは users.text_scale
  // （nextjs-web と同じ列）なので、Web で決めた設定がそのまま付いてくる。
  let userName: string | null = null;
  let textScale: TextScale = DEFAULT_TEXT_SCALE;
  // ヘッダーの設定の窓も利用者の言語で出す。**辞書はここで配る** —
  // 以前は各ページが個別に包んでいたので、layout にあるヘッダーは
  // Provider の外側にあり、常に既定（ja）になっていた（言語の切替も
  // 効いていないように見える）。ページ側の包みはそのままでも害は無い
  // （内側が勝つだけで、同じ値になる）。
  // 未ログイン（ログイン前の画面）は端末の言語設定を使う — セッションが
  // 無いので利用者の言語を引けない（SY09 で設定する kiosk_devices.locale。
  // ログインすればすぐ利用者本人の設定に切り替わる）。
  let locale: Locale = deviceLocale;
  try {
    const session = await getSession();
    userName = session?.displayName ?? null;
    if (session) {
      locale = session.locale;
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { textScale: true },
      });
      textScale = normalizeTextScale(user?.textScale);
    }
  } catch {
    // 端末名と同じくビルド時・DB 不通時は既定のまま
  }

  // 端末の既定作業場所をヘッダーに添える。**実績の作業場所は端末で決まる**
  // （読み取った QR > 端末の既定）のに、その既定は隠し設定画面の中にあって
  // 普段は確認できなかった。据え置きのタブレットが別の場所へ動かされたまま
  // 設定だけ残っている、というのが一番起きやすい取り違えなので、名前の隣に
  // 常時出しておく。**利用者の言語**で出す（端末名だけは登録前の画面でも
  // 読める必要があるため ja 固定 — lib/kiosk-auth.ts の方針）。
  let workLocation: string | null = null;
  if (deviceId) {
    try {
      workLocation = await getDeviceDefaultWorkLocationLabel(deviceId, locale);
    } catch {
      // 表示の添え物なので、引けなければ出さないだけ
    }
  }

  return (
    <>
      {/* 文字の大きさは **サーバーで** 流す。クライアントで当てると、最初の
          描画だけ既定の大きさで出てから切り替わり、文字がひと呼吸おいて跳ねる。 */}
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 列挙から作った数値だけ（lib/text-scale.ts）
        dangerouslySetInnerHTML={{ __html: textScaleRootCss(textScale) }}
      />

      {/* 登録済み端末はログイン前でも WS 接続を保持（プレゼンス）+ GPS 報告 */}
      {registered && <DevicePresence />}
      {registered && <LocationReporter />}
      <LastPageTracker />

      <I18nProvider locale={locale}>
        <KioskShell
          deviceName={deviceName}
          registered={registered}
          textScale={textScale}
          userName={userName}
          workLocation={workLocation}
        >
          {children}
        </KioskShell>
      </I18nProvider>
    </>
  );
}
