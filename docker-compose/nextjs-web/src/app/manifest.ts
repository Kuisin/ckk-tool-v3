import type { MetadataRoute } from "next";

/**
 * PWA マニフェスト（/manifest.webmanifest — Proxy の除外パスと一致）。
 * ホーム画面追加でスタンドアロン起動 + Web Push の受け皿になる
 * （iOS はホーム画面に追加した PWA のみ Web Push 可 — iOS 16.4+）。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CKK 業務管理システム",
    short_name: "CKK",
    description: "製造業務管理システム — 販売・購買・生産・出荷・請求・マスタ",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#228be6",
    lang: "ja",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android アダプティブアイコン用（白背景 + セーフゾーン余白入り）。
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
