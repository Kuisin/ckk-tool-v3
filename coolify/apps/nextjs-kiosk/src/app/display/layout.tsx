import type { Metadata, Viewport } from "next";

/**
 * /display レイアウト — 壁掛けテレビ用の全画面。装飾を一切持たない。
 *
 * キオスクのシェル（(kiosk)/layout.tsx）は付けない。誰も触らない画面なので、
 * ヘッダー・フッター・電池残量・隠しジェスチャはどれも意味が無いか、
 * あると害になる。中身がそのまま画面いっぱいを使う。
 */

export const metadata: Metadata = {
  title: "CKK ディスプレイ",
  description: "現場向け管理ディスプレイ",
};

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
        // dvh — Pi のブラウザでもアドレスバーの有無で高さがずれない
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--mantine-color-dark-8)",
      }}
    >
      {children}
    </div>
  );
}
