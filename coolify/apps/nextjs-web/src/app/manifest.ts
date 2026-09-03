import type { MetadataRoute } from "next";

/**
 * PWA マニフェスト（/manifest.webmanifest — Proxy の除外パスと一致）。
 * ホーム画面追加でスタンドアロン起動 + Web Push の受け皿になる
 * （iOS はホーム画面に追加した PWA のみ Web Push 可 — iOS 16.4+）。
 *
 * アイコン（public/icons/*.png、白背景）は `_assets/logo.svg` をベクタのまま
 * 描画して生成する。**全アイコン共通でロゴ幅 = キャンバスの 61.875%**
 * （= maskable のセーフゾーン基準。192 / 512 / maskable / apple-touch-icon
 * すべて同比率なので、どのプラットフォームでも同じ見え方になる）。iOS の
 * apple-touch-icon（180px）は app/layout.tsx が参照する。
 */
// PWA マニフェストは OS のホーム画面追加時に 1 回だけ読まれる静的ファイルで、
// リクエストスコープが無く言語を切り替えられない（lang も ja 固定）。
// アプリ名・説明はブランド表記として i18n-ignore（_specs/i18n-glossary.md §1）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "CKK 業務管理システム", // i18n-ignore
    short_name: "CKK",
    description: "製造業務管理システム — 販売・購買・生産・出荷・請求・マスタ", // i18n-ignore
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
