import type { Metadata, Viewport } from "next";
import { getDisplay } from "@/lib/display-auth";
import { getMessages, normalizeLocale } from "@/lib/i18n";

/**
 * /display レイアウト — 壁掛けテレビ用の全画面。装飾を一切持たない。
 *
 * キオスクのシェル（(kiosk)/layout.tsx）は付けない。誰も触らない画面なので、
 * ヘッダー・フッター・電池残量・隠しジェスチャはどれも意味が無いか、
 * あると害になる。中身がそのまま画面いっぱいを使う。
 */

/**
 * ページタイトルも盤面自身の表示言語（display_devices.locale）で出す。
 * 未登録・失効中は既定（ja）のまま——この時点ではまだどの画面かも
 * 決まっていない。
 */
export async function generateMetadata(): Promise<Metadata> {
  let locale = normalizeLocale(null);
  try {
    const auth = await getDisplay();
    locale = normalizeLocale(auth.ok ? auth.display.locale : auth.locale);
  } catch {
    // ビルド時・DB 不通時は既定のまま
  }
  const m = getMessages(locale);
  return {
    title: m.display.shell.appTitle,
    description: m.display.shell.appDescription,
  };
}

// テレビは触らないのでズーム抑止は不要だが、Pi のブラウザが勝手に
// スケールしないよう幅だけ固定する。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12141f",
};

export default function DisplayLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div
      style={{
        background: "var(--mantine-color-dark-8)",
        display: "flex",
        flexDirection: "column",
        // **画面ちょうど**を占める。min ではなく固定なのは、中身が伸びたときに
        // 下へはみ出させないため — 壁の画面はスクロールできないので、はみ出した
        // 分は存在しないのと同じになる。
        // dvh/dvw — Pi のブラウザでもアドレスバーの有無で寸法がずれない
        height: "100dvh",
        overflow: "hidden",
        width: "100dvw",
      }}
    >
      {children}
    </div>
  );
}
