import { prisma } from "./db";
import { workLocationLabel } from "./format";
import type { Locale } from "./i18n";

/**
 * device-work-location.ts — この端末の既定作業場所（表示用）。
 *
 * 実績に記録される作業場所は **端末で決まる**（読み取った QR > 端末の既定 >
 * 記録なし。`work-location-actuals` の不変条件）。つまり作業者から見ると
 * 「いまこのタブレットで開始したら、どこで作業したことになるのか」は端末の
 * 設定次第で、しかもそれは隠し設定画面の中にあって普段は見えない。
 * ヘッダーと工程開始前の案内が同じ値を出せるように、引き方をここへ 1 本化する。
 *
 * `getDevice()` には**足さない**。あれは毎リクエストの認証経路で、表示のための
 * JOIN を持ち込む場所ではない（端末名の解決だけで足りている）。
 */
export async function getDeviceDefaultWorkLocationLabel(
  deviceId: string,
  locale: Locale,
): Promise<string | null> {
  const row = await prisma.kioskDevice.findUnique({
    where: { id: deviceId },
    select: {
      defaultWorkLocation: {
        select: { name: true, group: { select: { name: true } } },
      },
    },
  });
  return workLocationLabel(row?.defaultWorkLocation, locale);
}
