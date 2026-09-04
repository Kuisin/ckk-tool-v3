import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

/**
 * マニュアル再編前の `apps/<アプリ>` → 再編後の `operations/<カテゴリ>/<アプリ>`。
 * 旧 URL のリダイレクト生成にのみ使う（カテゴリは src/lib/app-list.ts と同じ区分）。
 */
const MANUAL_APP_CATEGORY: Record<string, string> = {
  "trial-estimate": "sales",
  "price-list": "sales",
  quote: "sales",
  "order-acceptance": "sales",
  "design-request": "sales",
  "purchase-request": "purchasing",
  "purchase-order": "purchasing",
  "material-receipt": "purchasing",
  "outsource-order": "purchasing",
  "work-order": "production",
  // "approval" (旧 PD03 承認管理) はここに置かない — production 内のスラッグ
  // 改称ではなく 一般カテゴリの my-tasks (CM01) への統合なので、個別の
  // redirect エントリ（下の「旧 承認管理 (PD03) のマニュアル」節）で扱う。
  "product-inventory": "production",
  "material-inventory": "production",
  // 旧スラッグのまま残す（このマップは旧 URL の移設用）。shipping-order →
  // delivery-order の改称は redirects() 内の個別エントリが受け持つ。
  "shipping-order": "shipping",
  "delivery-note": "shipping",
  invoice: "billing",
  "billing-closing": "billing",
  "product-type": "system",
};

/**
 * セキュリティ応答ヘッダ（監査 M2）。nginx ではなくここに置くのは、
 * cloudflared 経由の公開経路が nginx を通らないため（app.ckk-tool.co.jp は
 * トンネルから web-main:3000 へ直結）。ここなら両経路に同じヘッダが乗る。
 *
 * CSP は **Report-Only** から始める。Mantine のインラインスタイルと Next の
 * ハイドレーション用インラインスクリプトがあるので、いきなり強制すると画面が
 * 白くなる。まず違反を集めて（ブラウザの Console に出る）、nonce 化してから
 * 強制に切り替える。ファイル配信ルート（attachments / design-files /
 * admin/files/raw）は自前の sandbox CSP を強制で付けている — そちらが本命。
 *
 * X-Frame-Options SAMEORIGIN: 内部の PDF プレビュー（同一オリジンの iframe）
 * は通し、他サイトからの埋め込み（クリックジャッキング）を止める。
 * HSTS は includeSubDomains を付けない — *.ckk-tool.co.jp には TLS 化して
 * いない社内ホストがある。
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value: "microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      // 端末管理のディスプレイ見本（共有端末アプリの /display/preview）
      "frame-src 'self' https://*.kai-lab.net https://*.ckk-tool.co.jp",
      "frame-ancestors 'self'",
      "object-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self' blob:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Emit a self-contained server bundle (.next/standalone) for a lean Docker image.
  output: "standalone",
  // pnpm workspace: 共有パッケージは TS ソースのまま取り込む（ビルドなし）。
  transpilePackages: ["@ckk/authz-core"],
  // monorepo ルートを明示 — standalone のトレース基点をリポジトリルートに固定。
  // このアプリは coolify/apps/nextjs-web にあるので 3 つ上がリポジトリルート。
  // ここがズレると Turbopack がワークスペースルートを誤検出してビルドが落ちる。
  outputFileTracingRoot: path.join(__dirname, "../../../"),
  // NOTE: 外部 URL の画像に images.remotePatterns を足しても standalone 実行
  // （本番コンテナ）では効かず 400 "url" parameter is not allowed になった
  // （同じビルドでも next start では通る）。docs の外部画像は next/image を
  // 経由させない方針に変更したため、ここには設定を置かない
  // — components/docs/mdx-components.tsx を参照。
  // PDF route handlers read HTML/CSS templates from src/pdf-templates at runtime;
  // file tracing can't see fs.readFile paths, so include them in the bundle.
  // (docs content needs no entry — fumadocs-mdx compiles it at build time.)
  outputFileTracingIncludes: {
    "/api/pdf/**": ["src/pdf-templates/**/*"],
  },
  experimental: {
    // アップロードは proxy.ts を通るので、**プロキシ側のボディ上限が実効上限**に
    // なる（既定 10MB）。超えた分は黙って切り捨てられ、サーバーログに
    // "Request body exceeded 10MB … Only the first 10MB will be available" が
    // 出るだけ — 受け取ったファイルは壊れる。添付・注文請書取込が 20MB、
    // フロアマップ図面が 10MB を許可しているため、multipart のオーバーヘッド
    // 込みで収まる値にしておく。個々の上限は各ハンドラ側で弾く。
    proxyClientMaxBodySize: "24mb",
    // メモリの少ないビルドホスト（例: 8GB の Docker Desktop VM）では Turbopack の
    // 並列コンパイル + MDX ローダ子プロセスがスラッシングして IPC タイムアウトに
    // なることがある。TURBOPACK_MEMORY_LIMIT（バイト）でキャッシュ目標を絞れる。
    // 未設定（Coolify 等）では無効 — 従来どおり。
    ...(process.env.TURBOPACK_MEMORY_LIMIT
      ? { turbopackMemoryLimit: Number(process.env.TURBOPACK_MEMORY_LIMIT) }
      : {}),
  },
  // デプロイ（Docker/Coolify）ビルドでは next build 内の型チェックを省く。
  // 同じ検証は PR の CI が `pnpm build`（型チェック有効）で必ず実施しており、
  // dev/main へは PR 経由でしか入らないため二重実行になっている。
  // 計測: このステップだけで約 17 秒（デプロイ全体 約 112 秒のうち）。
  // ローカル / CI では未設定 = 従来どおり型チェックする。
  ...(process.env.NEXT_SKIP_TYPE_CHECK === "1"
    ? { typescript: { ignoreBuildErrors: true } }
    : {}),
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return [
      // ディスプレイ管理は独立アプリ（SY0I）をやめ、端末管理（SY09）の
      // タブに統合した。機器の登録手順が共有端末とまったく同じなので、
      // 別の場所に置くと「どっちの画面で直すのか」を現場が毎回考えることになる。
      {
        source: "/settings/displays",
        destination: "/settings/kiosk-devices",
        permanent: true,
      },
      {
        source: "/settings/displays/:path*",
        destination: "/settings/kiosk-devices",
        permanent: true,
      },
      // 旧 承認管理 (PD03) → 一般カテゴリの 未処理一覧 (CM01)。
      // 詳細 URL は指示書詳細へ（承認カードは指示書詳細に出る）。
      {
        source: "/production/approvals",
        destination: "/general/tasks",
        permanent: true,
      },
      {
        source: "/production/approvals/:id",
        destination: "/production/work-orders/:id",
        permanent: true,
      },
      // 旧 承認管理 (PD03) のマニュアル。1. 再編前の短い URL
      // (apps/approval)、2. 再編後だが CM01 統合前の URL
      // (operations/production/approval) の両方から、統合後の
      // operations/general/my-tasks へ寄せる。
      {
        source: "/manual/:lang(ja|en|zh)/apps/approval/:path*",
        destination: "/manual/:lang/operations/general/my-tasks/:path*",
        permanent: true,
      },
      {
        source: "/manual/:lang(ja|en|zh)/operations/production/approval/:path*",
        destination: "/manual/:lang/operations/general/my-tasks/:path*",
        permanent: true,
      },
      // 旧 /docs（?lang= クエリ方式）→ 新 /manual・/admin-manual（ロケール
      // セグメント方式）。スラッグは維持。system/* だけ社内ツリーへ。
      ...(["en", "zh"] as const).flatMap((lang) => [
        {
          source: "/docs/system/:path*",
          has: [{ type: "query", key: "lang", value: lang } as const],
          destination: `/admin-manual/${lang}/system/:path*`,
          permanent: true,
        },
        {
          source: "/docs/:path*",
          has: [{ type: "query", key: "lang", value: lang } as const],
          destination: `/manual/${lang}/:path*`,
          permanent: true,
        },
      ]),
      {
        source: "/docs/system/:path*",
        destination: "/admin-manual/ja/system/:path*",
        permanent: true,
      },
      {
        source: "/docs/:path*",
        destination: "/manual/ja/:path*",
        permanent: true,
      },
      { source: "/docs", destination: "/manual/ja", permanent: true },
      { source: "/manual", destination: "/manual/ja", permanent: true },

      // マニュアル再編（apps/masters/system/kiosk → operations/<カテゴリ>/…）。
      // 既存のブックマーク・外部リンク・社内チャットに貼られた URL を維持する。
      // apps だけはカテゴリを跨ぐのでアプリ単位、他はまとめて 1 行ずつ。
      ...Object.entries(MANUAL_APP_CATEGORY).map(([app, category]) => ({
        source: `/manual/:lang(ja|en|zh)/apps/${app}/:path*`,
        destination: `/manual/:lang/operations/${category}/${app}/:path*`,
        permanent: true,
      })),
      ...(["masters", "system", "kiosk"] as const).map((section) => ({
        source: `/manual/:lang(ja|en|zh)/${section}/:path*`,
        destination: `/manual/:lang/operations/${section}/:path*`,
        permanent: true,
      })),
      {
        source: "/admin-manual",
        destination: "/admin-manual/ja",
        permanent: true,
      },
      // 社内ドキュメント → 管理マニュアル 改名（2026-08）。一般カテゴリの
      // 社内文書 (CM03) と紛らわしかったので改名した。ブックマークと社内チャットに
      // 貼られた旧 URL を維持する。
      {
        source: "/internal-docs",
        destination: "/admin-manual/ja",
        permanent: true,
      },
      {
        source: "/internal-docs/:path*",
        destination: "/admin-manual/:path*",
        permanent: true,
      },

      // 顧客(MS01) / 最終需要家(MS02) / 外注企業(MS03) → 取引先マスタ(MS01)。
      // 3 アプリを 1 台帳 + ロール付与に統合したので、旧パスは id ごと引き継ぐ
      // （BP の id はそのまま。支店パスも同形なので :path* で足りる）。
      ...(["customers", "end-users", "suppliers"] as const).map((old) => ({
        source: `/master/${old}/:path*`,
        destination: "/master/business-partners/:path*",
        permanent: true,
      })),
      ...(["customers", "end-users", "suppliers"] as const).map((old) => ({
        source: `/master/${old}`,
        destination: "/master/business-partners",
        permanent: true,
      })),

      // 注文請書（PD01, /production/sales-orders）→ 注文明細（SA05,
      // /sales/order-lines）。注文請書の明細に統合し、販売カテゴリへ移設した。
      // 新規・編集画面は廃止（作成は注文請書の明細エディタ）なので、
      // /new と /:id/edit は一覧・詳細へ寄せる。
      {
        source: "/production/sales-orders/new",
        destination: "/sales/order-lines",
        permanent: true,
      },
      {
        source: "/production/sales-orders/:id/edit",
        destination: "/sales/order-lines/:id",
        permanent: true,
      },
      {
        source: "/production/sales-orders/:path*",
        destination: "/sales/order-lines/:path*",
        permanent: true,
      },
      {
        source: "/production/sales-orders",
        destination: "/sales/order-lines",
        permanent: true,
      },

      // 承認グループ (MS0B) → 承認設定。グループの箱を作るだけでなく、
      // 書類種別ごとの承認ステップ（何段目にどのグループか）も持つようになった
      // ため、旧パス名では中身と合わない。
      {
        source: "/master/approval-groups/:path*",
        destination: "/master/approval-settings/:path*",
        permanent: true,
      },
      {
        source: "/master/approval-groups",
        destination: "/master/approval-settings",
        permanent: true,
      },

      // 出荷書の英語名を shipping order → delivery order（DO）へ改称。
      // 旧パス（アプリ・マニュアルとも）はメモ内リンク・通知・ブックマークに
      // 残っているため引き継ぐ。文書番号 SHP-… の URL は詳細ページ側で
      // DOR-… へ読み替える。
      {
        source: "/shipping/shipping-orders/:path*",
        destination: "/shipping/delivery-orders/:path*",
        permanent: true,
      },
      {
        source: "/shipping/shipping-orders",
        destination: "/shipping/delivery-orders",
        permanent: true,
      },
      {
        source:
          "/manual/:lang(ja|en|zh)/operations/shipping/shipping-order/:path*",
        destination: "/manual/:lang/operations/shipping/delivery-order/:path*",
        permanent: true,
      },

      // 承認グループのマニュアルも 承認設定 へ改称。MANUAL_APP_CATEGORY は
      // カテゴリ移動用でスラッグの改称は見ないので、ここに個別に置く。
      {
        source:
          "/manual/:lang(ja|en|zh)/operations/masters/approval-group/:path*",
        destination: "/manual/:lang/operations/masters/approval-setting/:path*",
        permanent: true,
      },

      // マニュアルも 1 ページに統合。
      ...(["customer", "end-user", "supplier"] as const).map((old) => ({
        source: `/manual/:lang(ja|en|zh)/operations/masters/${old}/:path*`,
        destination: "/manual/:lang/operations/masters/business-partner/:path*",
        permanent: true,
      })),
    ];
  },
  async rewrites() {
    return [
      // 公開マニュアルの生 Markdown: /manual/<lang>/<slug>.md → llms-manual ルート。
      { source: "/manual/:path*.md", destination: "/llms-manual/:path*" },
    ];
  },
};

const withMDX = createMDX();
// 言語は URL ではなくユーザー設定で決まる（src/i18n/request.ts 参照）。
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(withMDX(nextConfig));
