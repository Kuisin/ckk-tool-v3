/**
 * app-list.ts — App launcher & home page data source
 *
 * Each entry defines one "app" (a route section).
 * Used by AppLauncher (popover) and HomeApps (dashboard grid).
 *
 * DESIGN NOTES:
 * - [Custom] This is a static config file, not a DB table.
 *   The demo system used a similar pattern with `appList` / `shortcutList`.
 * - [Custom] `requiredPermission` maps to the `permissions.code` column in the DB.
 *   The UI filters the list at runtime based on the current user's permissions
 *   (queried via the `user_permissions` view — see CLAUDE.md RBAC note).
 * - [Custom] Icons use @tabler/icons-react (tree-shakeable, Mantine-aligned).
 *   In the real implementation, import each icon by name; listed as string here for reference.
 */

import type { Locale } from "./i18n";

export type AppCategory =
  | "一般"
  | "販売"
  | "購買"
  | "生産"
  | "出荷"
  | "請求"
  | "マスタ"
  | "ドキュメント"
  | "システム";

export interface AppEntry {
  /** Unique key, also used as i18n dict key */
  key: string;
  /** Japanese display label (also used as fallback if i18n not loaded) */
  label: string;
  /** List-screen operation code — see `_specs/operation-code.md` */
  operationCode: string;
  /** Route path relative to / */
  href: string;
  /** Tabler icon name — import as Icon{Name} from @tabler/icons-react */
  icon: string;
  /** App category for grouping */
  category: AppCategory;
  /**
   * Permission code required to see this app.
   * Matches `permissions.code` in the DB.
   * null = visible to all authenticated users.
   */
  requiredPermission: string | null;
}

export const appList: AppEntry[] = [
  // ─── 一般 ──────────────────────────────────────────────────────────────────
  {
    // 未処理一覧 — 自分の作業予定（work_order_step_plans）と、承認依頼中の
    // 承認依頼（旧 承認管理 PD03 の横断一覧）をまとめた個人のやることアプリ。
    // 承認セクションは approve 権限がある人にだけ出る（ページ側で判定）。
    key: "my-tasks",
    label: "未処理一覧",
    operationCode: "CM01",
    href: "/general/tasks",
    icon: "IconClipboardList",
    category: "一般",
    requiredPermission: null,
  },

  {
    // フォーム — 利用者が項目を組んで作る汎用フォーム（アンケート / 申請・報告）。
    // アプリ自体は全員が開ける（回答するため）。作成できるかは form:CREATE で、
    // 個々のフォームを誰に見せるかは share_grants（フォームごとの共有設定）が決める。
    key: "forms",
    label: "フォーム",
    operationCode: "CM02",
    href: "/general/forms",
    icon: "IconForms",
    category: "一般",
    requiredPermission: null,
  },

  {
    // 社内文書 — 利用者が書く Markdown 文書。手順書・議事録・ノウハウなど。
    // DC02「管理マニュアル」（開発者が書くビルド時の MDX）とは別物。
    // アプリを開けるのは internal_page:READ を持つ人で、個々の文書を誰に
    // 見せるかは share_grants（文書ごとの共有設定）が決める。
    key: "internal-pages",
    label: "社内文書",
    operationCode: "CM03",
    href: "/general/documents",
    icon: "IconFileDescription",
    category: "一般",
    requiredPermission: "internal_page",
  },

  // ─── 販売 ──────────────────────────────────────────────────────────────────
  // 業務フロー順: 価格試算 → 価格表 → 見積書 → 注文請書（設計依頼書は並行フロー）
  {
    key: "trial-estimates",
    label: "価格試算",
    operationCode: "SA01",
    href: "/sales/trial-estimates",
    icon: "IconCalculator",
    category: "販売",
    // 価格試算のアクションは price_list を要求する（見積連動の価格表ソース）
    requiredPermission: "price_list",
  },
  {
    key: "price-lists",
    label: "価格表",
    operationCode: "SA02",
    href: "/sales/price-lists",
    icon: "IconCurrencyYen",
    category: "販売",
    requiredPermission: "price_list",
  },
  {
    key: "quotes",
    label: "見積書",
    operationCode: "SA03",
    href: "/sales/quotes",
    icon: "IconFileText",
    category: "販売",
    requiredPermission: "quote",
  },
  {
    // 注文請書 intake（§2）— 監視フォルダ / 優先取込の取込状況一覧が本体。
    // 展開後の注文明細管理（PD01）は /sales/order-lines
    // （取込一覧のヘッダーからリンク）。
    key: "order-acceptances",
    label: "注文請書",
    operationCode: "SA04",
    href: "/sales/order-acceptances",
    icon: "IconClipboardCheck",
    category: "販売",
    requiredPermission: "order_acceptance",
  },
  {
    // 注文請書を確定すると明細ごとに ORD-…-NN が採番される。その明細を
    // 注文請書をまたいで横断表示し、指示書・出荷・引当の進捗を追う画面。
    // 作成・編集は注文請書 (SA04) の明細エディタが唯一の入口。
    key: "order-lines",
    label: "注文明細",
    operationCode: "SA05",
    href: "/sales/order-lines",
    icon: "IconListDetails",
    category: "販売",
    requiredPermission: "order_acceptance",
  },
  {
    key: "design-requests",
    label: "設計依頼書",
    operationCode: "SA06",
    href: "/sales/design-requests",
    icon: "IconRuler2",
    category: "販売",
    requiredPermission: "design_request",
  },

  // ─── 購買 ──────────────────────────────────────────────────────────────────
  // 業務フロー順: 購買依頼 → 素材発注書 → 素材入荷（外注依頼は工程外注の別フロー）
  {
    // 業務フロー上、素材発注書の前段（依頼 → 承認 → 発注書へ変換）
    key: "purchase-requests",
    label: "購買依頼",
    operationCode: "PU01",
    href: "/purchase/purchase-requests",
    icon: "IconClipboardList",
    category: "購買",
    requiredPermission: "purchase_order",
  },
  {
    key: "purchase-orders",
    label: "素材発注書",
    operationCode: "PU02",
    href: "/purchase/purchase-orders",
    icon: "IconShoppingCart",
    category: "購買",
    requiredPermission: "purchase_order",
  },
  {
    key: "material-receipts",
    label: "素材入荷",
    operationCode: "PU03",
    href: "/purchase/material-receipts",
    icon: "IconPackageImport",
    category: "購買",
    requiredPermission: "material_receipt",
  },
  {
    key: "outsource-orders",
    label: "外注依頼",
    operationCode: "PU04",
    href: "/purchase/outsource-orders",
    icon: "IconTruckDelivery",
    category: "購買",
    requiredPermission: "outsource_order",
  },

  // ─── 生産 ──────────────────────────────────────────────────────────────────
  {
    key: "work-orders",
    label: "指示書",
    operationCode: "PD02",
    href: "/production/work-orders",
    icon: "IconSettings2",
    category: "生産",
    requiredPermission: "work_order",
  },
  // 旧 承認管理 (PD03, /production/approvals) は廃止 — 承認依頼中の横断一覧は
  // 一般カテゴリの 未処理一覧 (CM01, /general/tasks) に移った。
  {
    // 在庫管理 — 旧 製品在庫 (PD04) / 素材在庫 (PD05) を統合した単一アプリ。
    // 製品・素材・仕掛品・ロケーション（保管場所×棚）+ 在庫移動。
    key: "inventory",
    label: "在庫管理",
    operationCode: "PD04",
    href: "/production/inventory",
    icon: "IconBoxSeam",
    category: "生産",
    requiredPermission: "inventory",
  },
  {
    // 設計図 — 図面（design_files）の台帳。版は (製品 × 受注元) ごとに数える。
    // 設計依頼 (SA06) は「作ってほしい」という起票で、こちらはその成果物と
    // 依頼を経ない取り込みの両方を持つ。**版を登録・編集できる唯一の画面**で、
    // 製品マスタ (MS24) と設計依頼 (SA26) は表示だけ。
    key: "design-files",
    label: "設計図",
    operationCode: "PD06",
    href: "/production/design-files",
    icon: "IconFileVector",
    category: "生産",
    requiredPermission: "design_file",
  },
  {
    // 未処理指示書 — 「まだ指示書になっていない注文明細」＋「完了していない
    // 指示書」の作業キュー。指示書一覧 (PD02) が台帳なのに対し、こちらは
    // 「次に手を動かすもの」だけを出す。作成の入口は PD12（同じフォーム）。
    key: "pending-work-orders",
    label: "未処理指示書",
    operationCode: "PD05",
    href: "/production/pending-work-orders",
    icon: "IconProgress",
    category: "生産",
    requiredPermission: "work_order",
  },

  // ─── 出荷 ──────────────────────────────────────────────────────────────────
  {
    key: "delivery-orders",
    label: "出荷書",
    operationCode: "SH01",
    href: "/shipping/delivery-orders",
    icon: "IconTruck",
    category: "出荷",
    requiredPermission: "delivery_order",
  },
  {
    key: "delivery-notes",
    label: "納品書",
    operationCode: "SH02",
    href: "/shipping/delivery-notes",
    icon: "IconReceipt",
    category: "出荷",
    requiredPermission: "delivery_note",
  },
  {
    // 未処理出荷書 — 「完成したのに出荷書に載っていない注文明細」＋「まだ出て
    // いない出荷書」の作業キュー。出荷書一覧 (SH01) が台帳、こちらが待ち行列。
    key: "pending-shipments",
    label: "未処理出荷書",
    operationCode: "SH03",
    href: "/shipping/pending-shipments",
    icon: "IconTruckLoading",
    category: "出荷",
    requiredPermission: "delivery_order",
  },

  // ─── 請求 ──────────────────────────────────────────────────────────────────
  {
    key: "invoices",
    label: "請求書",
    operationCode: "BL01",
    href: "/billing/invoices",
    icon: "IconFileInvoice",
    category: "請求",
    requiredPermission: "invoice",
  },
  {
    key: "billing-closings",
    label: "締日処理",
    operationCode: "BL02",
    href: "/billing/closings",
    icon: "IconCalendarDue",
    category: "請求",
    requiredPermission: "billing_closing",
  },

  // ─── マスタ ────────────────────────────────────────────────────────────────
  // 顧客 (旧 MS01) / 最終需要家 (旧 MS02) / 外注企業 (旧 MS03) は 1 つの
  // 取引先マスタに統合済み — 1 法人 1 レコード + ロール付与で使い分ける。
  // MS02 / MS03 は欠番（他マスタの操作コードは据え置き）。
  {
    key: "master-business-partners",
    label: "取引先",
    operationCode: "MS01",
    href: "/master/business-partners",
    icon: "IconBuilding",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-products",
    label: "製品",
    operationCode: "MS04",
    href: "/master/products",
    icon: "IconCylinder",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-types",
    label: "材種",
    operationCode: "MS05",
    href: "/master/material-types",
    icon: "IconAtom",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-materials",
    label: "素材",
    operationCode: "MS06",
    href: "/master/materials",
    icon: "IconBolt",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-material-numbering",
    label: "採番構成",
    operationCode: "MS07",
    href: "/master/material-numbering",
    icon: "IconHash",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-process-steps",
    label: "工程マスタ",
    operationCode: "MS08",
    href: "/master/process-steps",
    icon: "IconGitBranch",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-inspection-templates",
    label: "検査表テンプレート",
    operationCode: "MS09",
    href: "/master/inspection-templates",
    icon: "IconListCheck",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-defect-types",
    label: "不良種類",
    operationCode: "MS0A",
    href: "/master/defect-types",
    icon: "IconAlertTriangle",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    // key は feature_flags のキー（app:<key>:main）— 変えると main で
    // アプリが消えるので、改称してもキーは据え置く。
    key: "master-approval-groups",
    label: "承認設定",
    operationCode: "MS0B",
    href: "/master/approval-settings",
    icon: "IconUsersGroup",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    key: "master-plants",
    label: "拠点",
    operationCode: "MS0C",
    href: "/master/plants",
    icon: "IconBuildingWarehouse",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    // 作業場所（グループ = 機械種別/エリア、場所 = 機械 1 台・1 区画）
    key: "master-work-locations",
    label: "作業場所",
    operationCode: "MS0D",
    href: "/master/work-locations",
    icon: "IconMapPin",
    category: "マスタ",
    requiredPermission: "master",
  },
  {
    // 保管場所（拠点内の倉庫・置場 + 棚。フロアマップへのピン配置も行う）
    key: "master-storage-locations",
    label: "保管場所",
    operationCode: "MS0E",
    href: "/master/storage-locations",
    icon: "IconPackages",
    category: "マスタ",
    requiredPermission: "master",
  },

  // ─── ドキュメント ──────────────────────────────────────────────────────────
  {
    // マニュアル（/manual・fumadocs）。公開ページだが launcher からも開ける。
    key: "docs",
    label: "マニュアル",
    operationCode: "DC01",
    href: "/manual/ja",
    icon: "IconBook2",
    category: "ドキュメント",
    requiredPermission: null,
  },
  {
    // 管理マニュアル（/admin-manual）。端末セットアップ等の管理者向け手順。
    // 公開マニュアル（DC01）とは別権限 — admin_manual を持つ人だけに見せる。
    // 旧称は「社内ドキュメント」(/internal-docs, internal_docs)。一般カテゴリの
    // 社内文書 (CM03) と紛らわしいので改名した。key はフィーチャーフラグの
    // キーでもあるので、変えるときは feature_flags 側も一緒に直すこと。
    key: "admin-manual",
    label: "管理マニュアル",
    operationCode: "DC02",
    href: "/admin-manual/ja",
    icon: "IconBookmarks",
    category: "ドキュメント",
    requiredPermission: "admin_manual",
  },

  // ─── システム ──────────────────────────────────────────────────────────────
  // 採番: SY01 = ユーザー管理、SY02–SY04 = アプリ設定、SY05– = 管理系。
  // （旧 SY01 システム設定ハブは廃止 — 他カテゴリ同様ハブアプリは持たない。）
  {
    // ユーザー管理 — app.users の一覧・詳細（ロール割当・実効権限の確認）。
    key: "user-management",
    label: "ユーザー管理",
    operationCode: "SY01",
    href: "/settings/users",
    icon: "IconUserCog",
    category: "システム",
    // 利用停止・所属拠点の変更は特権操作（user_admin）。入口もそこへ寄せる —
    // system:READ を入口にすると、申請できるようにするために SY02 価格試算計算や
    // SY0E AI プロバイダまで開いてしまう。
    requiredPermission: "user_admin",
  },
  {
    // 価格試算カスタマイズ（計算基準・カスタム入力・カスタム計算 JS）。system 権限。
    key: "trial-pricing-engine",
    label: "価格試算計算",
    operationCode: "SY02",
    href: "/settings/trial-pricing-engine",
    icon: "IconMathFunction",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 製品項目 — 入力項目の定義ライブラリ。system 権限。
    key: "product-items",
    label: "製品項目",
    operationCode: "SY03",
    href: "/settings/product-items",
    icon: "IconListDetails",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 製品種別 — 項目を割り当てるテンプレート。system 権限。
    key: "product-types",
    label: "製品種別",
    operationCode: "SY04",
    href: "/settings/product-types",
    icon: "IconCategory",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // アプリ管理 — 環境別のアプリ表示 ON/OFF（feature_flags）。
    key: "app-management",
    label: "アプリ管理",
    operationCode: "SY05",
    href: "/settings/apps",
    icon: "IconLayoutGrid",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // ファイル管理 — ファイル（SeaweedFS）の Finder 風ブラウザ。閲覧範囲は
    // lib/file-access.ts（system:ADMIN / フォルダ権限 / 所有アプリ権限）で
    // 決まるため誰でも開ける — 権限が無ければ空表示になるだけ。
    key: "file-management",
    label: "ファイル管理",
    operationCode: "SY06",
    href: "/settings/files",
    icon: "IconFolder",
    category: "システム",
    requiredPermission: null,
  },
  {
    // 操作履歴 — 監査ログ（作成・更新・削除の before/after）。
    key: "activity-log",
    label: "操作履歴",
    operationCode: "SY07",
    href: "/settings/activity",
    icon: "IconHistory",
    category: "システム",
    // 横断検索は個人データ。閲覧そのものに承認が要る（書類ごとの履歴タブは別）。
    requiredPermission: "personal_data",
  },
  {
    // QRカード管理 — キオスク（共有端末）ログイン用カードの発行・割当・印刷。
    key: "kiosk-cards",
    label: "QRカード管理",
    operationCode: "SY08",
    href: "/settings/kiosk-cards",
    icon: "IconQrcode",
    category: "システム",
    // 一覧・詳細はこの権限で見える。発行・割当・PIN は昇格が要る。
    requiredPermission: "kiosk_card",
  },
  {
    // 端末管理 — キオスク端末の有効化・状態管理・フロアマップ配置。
    key: "kiosk-devices",
    label: "端末管理",
    operationCode: "SY09",
    href: "/settings/kiosk-devices",
    icon: "IconDeviceTablet",
    category: "システム",
    requiredPermission: "kiosk",
  },
  {
    // 共有端末設定 — ランチャーのアプリ表示 on/off + 認証ポリシー参照。
    key: "kiosk-settings",
    label: "共有端末設定",
    operationCode: "SY0A",
    href: "/settings/kiosk",
    icon: "IconDeviceTabletCog",
    category: "システム",
    requiredPermission: "kiosk",
  },
  {
    // リンク管理 — メモ / コメント内の外部リンク索引とブロック指定。
    key: "links",
    label: "リンク管理",
    operationCode: "SY0B",
    href: "/settings/links",
    icon: "IconLink",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 注文書取込 — 受注請書の監視フォルダ（INTAKE_DIR）へまとめて投入し、
    // 待ち / 取込済 / 失敗を見る。取り込まれた中身は SA04 受注請書で見る。
    key: "order-intake",
    label: "注文書取込",
    operationCode: "SY0C",
    href: "/settings/order-intake",
    icon: "IconFileImport",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // ログイン履歴 — Web / キオスク両方の認証イベント（成功・失敗）。
    // 「誰がどこから何回試したか」を後から追える唯一の場所。
    key: "login-history",
    label: "ログイン履歴",
    operationCode: "SY0D",
    href: "/settings/login-history",
    icon: "IconShieldLock",
    category: "システム",
    // 一覧は personal_data:READ で見える。詳細（IP・端末シグネチャ）は昇格が要る。
    requiredPermission: "personal_data",
  },
  {
    // AI プロバイダ — 文書抽出（注文請書の取込）と AI 補助タスクが使うモデルの
    // 接続先。既定はローカル ollama で、外部プロバイダは管理者が設定したときだけ。
    key: "ai-provider",
    label: "AI プロバイダ",
    operationCode: "SY0E",
    href: "/settings/ai-provider",
    icon: "IconRobot",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 通知メール — 通知をメールで送るときのまとめ方。既定は Teams と同じで
    // 「見逃した未読だけを、間隔をあけて 1 通」。読まれた通知は送らない。
    key: "notification-email",
    label: "通知メール",
    operationCode: "SY0F",
    href: "/settings/notification-email",
    icon: "IconMailFast",
    category: "システム",
    requiredPermission: "system",
  },
  {
    // 特権アクセス — システム上重要な操作を「申請 → 別の人の承認 → 期限つきで
    // 実行」に分ける。requiredPermission は null（誰でも開ける）: 中身は自分が
    // 申請できるもの / 決裁できるものだけなので、権限の無い人には空で出る。
    // 入口に権限を置くと、申請したい人にまず入口の権限を配ることになり、
    // 分離した意味が薄れる（my-tasks / forms と同じ扱い）。
    key: "privileged-access",
    label: "特権アクセス",
    operationCode: "SY0G",
    href: "/settings/privileged-access",
    icon: "IconShieldCheck",
    category: "システム",
    requiredPermission: null,
  },
  {
    // 取引先ポータル — 社外の人（取引先・需要家）に自社宛の書類を見せるための
    // アカウントと書類リンクの管理。**SY01 ユーザー管理の拡張にはしない**:
    // あちらの主体は社員（app.users）で、ポータルの主体は別の表
    // （app.portal_accounts）。混ぜると一覧が主体混在の表になる。
    //
    // requiredPermission は portal_admin。**業務ロールには配っていない**
    // （rbac-seed.sql / roles-seed.sql の除外リスト）— 社外の個人データを読み、
    // 書類を外に出せる権限なので、既定で全社員に渡ってはいけない。
    //
    // 開発中は src/config/dev-features.json が dev 限定に閉じており、
    // app-flags.ts の getDisabledAppKeys() がそれを合流させるので main では出ない。
    key: "portal-admin",
    label: "取引先ポータル",
    operationCode: "SY0H",
    href: "/settings/portal",
    icon: "IconUsersGroup",
    category: "システム",
    requiredPermission: "portal_admin",
  },
];

/** Home 絞り込み（工程）で使う URL パラメータのキー。 */
export const WORKPROCESS_PARAM = "wp";

/** 有効な工程（カテゴリ）名か判定する。パンくず/URL の検証に使う。 */
export function isAppCategory(value: string): value is AppCategory {
  return value in CATEGORY_COLORS;
}

/** 工程（カテゴリ）で Home を絞り込むリンク先。 */
export function workprocessHomeHref(category: AppCategory): string {
  return `/?${WORKPROCESS_PARAM}=${encodeURIComponent(category)}`;
}

/**
 * Category color mapping for ThemeIcon in AppLauncher and HomeApps.
 * [Custom] Each category gets a consistent color across all views.
 */
export const CATEGORY_COLORS: Record<AppCategory, string> = {
  一般: "indigo",
  販売: "blue",
  購買: "teal",
  生産: "violet",
  出荷: "orange",
  請求: "pink",
  マスタ: "gray",
  ドキュメント: "cyan",
  システム: "dark",
};

/**
 * アプリ名・カテゴリ名の ja→en/zh 対訳（_specs/i18n-glossary.md §3.1〜3.2）。
 * `label`/`category` は内部キー兼 ja フォールバックとして残し、表示だけ
 * ここを経由して言語を切り替える — 呼び出し側は `appLabel(entry, locale)` /
 * `categoryLabel(category, locale)` を使うこと。
 */
export const APP_LABEL_I18N: Record<string, { en: string; zh: string }> = {
  "my-tasks": { en: "Pending list", zh: "未处理列表" },
  forms: { en: "Forms", zh: "表单" },
  "internal-pages": { en: "Internal documents", zh: "内部文档" },
  "trial-estimates": { en: "Price estimate", zh: "价格试算" },
  "price-lists": { en: "Price list", zh: "价格表" },
  quotes: { en: "Quote", zh: "报价单" },
  "order-acceptances": { en: "Order acceptance", zh: "订单确认书" },
  "order-lines": { en: "Order line", zh: "订单明细" },
  "design-requests": { en: "Design request", zh: "设计委托单" },
  "purchase-requests": { en: "Purchase request", zh: "采购申请" },
  "purchase-orders": { en: "Material purchase order", zh: "材料采购单" },
  "material-receipts": { en: "Material receipt", zh: "材料到货" },
  "outsource-orders": { en: "Outsource order", zh: "外协委托单" },
  "work-orders": { en: "Work order", zh: "工单" },
  inventory: { en: "Inventory", zh: "库存管理" },
  "pending-work-orders": { en: "Pending work orders", zh: "未处理工单" },
  "delivery-orders": { en: "Delivery order", zh: "出货单" },
  "delivery-notes": { en: "Delivery note", zh: "送货单" },
  "pending-shipments": { en: "Pending shipments", zh: "未处理出货" },
  invoices: { en: "Invoice", zh: "请款单" },
  "billing-closings": { en: "Billing closing", zh: "结算处理" },
  "master-business-partners": { en: "Business partners", zh: "业务伙伴" },
  "master-products": { en: "Products", zh: "产品" },
  "master-material-types": { en: "Material types", zh: "材料类别" },
  "master-materials": { en: "Materials", zh: "材料" },
  "master-material-numbering": { en: "Code numbering", zh: "编号构成" },
  "master-process-steps": { en: "Process steps", zh: "工序主数据" },
  "master-inspection-templates": {
    en: "Inspection templates",
    zh: "检查表模板",
  },
  "master-defect-types": { en: "Defect types", zh: "不良类别" },
  "master-approval-groups": { en: "Approval settings", zh: "审批设置" },
  "master-plants": { en: "Sites", zh: "据点" },
  "master-work-locations": { en: "Work locations", zh: "作业场所" },
  "master-storage-locations": { en: "Storage locations", zh: "存放位置" },
  docs: { en: "Manual", zh: "操作手册" },
  "admin-manual": { en: "Admin manual", zh: "管理手册" },
  "user-management": { en: "Users", zh: "用户管理" },
  "trial-pricing-engine": { en: "Price estimate engine", zh: "价格试算计算" },
  "product-items": { en: "Product items", zh: "产品项目" },
  "product-types": { en: "Product types", zh: "产品类别" },
  "app-management": { en: "Apps", zh: "应用管理" },
  "file-management": { en: "Files", zh: "文件管理" },
  "activity-log": { en: "Activity log", zh: "操作历史" },
  "kiosk-cards": { en: "QR cards", zh: "二维码卡管理" },
  "kiosk-devices": { en: "Devices", zh: "终端管理" },
  "kiosk-settings": { en: "Shared device settings", zh: "共用终端设置" },
  links: { en: "Links", zh: "链接管理" },
  "order-intake": { en: "Order intake", zh: "订单导入" },
  "login-history": { en: "Login history", zh: "登录历史" },
  "ai-provider": { en: "AI provider", zh: "AI 服务商" },
  "notification-email": { en: "Notification email", zh: "通知邮件" },
  "design-files": { en: "Drawing", zh: "图纸" },
  "privileged-access": { en: "Privileged access", zh: "特权访问" },
  "portal-admin": { en: "Partner portal", zh: "客户门户" },
};

export const CATEGORY_LABEL_I18N: Record<
  AppCategory,
  { en: string; zh: string }
> = {
  一般: { en: "General", zh: "通用" },
  販売: { en: "Sales", zh: "销售" },
  購買: { en: "Purchasing", zh: "采购" },
  生産: { en: "Production", zh: "生产" },
  出荷: { en: "Shipping", zh: "出货" },
  請求: { en: "Billing", zh: "请款" },
  マスタ: { en: "Master data", zh: "主数据" },
  ドキュメント: { en: "Documents", zh: "文档" },
  システム: { en: "System", zh: "系统" },
};

/** アプリの表示名を言語ごとに解決する（未登録キー・ja は entry.label のまま）。 */
export function appLabel(entry: AppEntry, locale: Locale): string {
  if (locale === "ja") return entry.label;
  return APP_LABEL_I18N[entry.key]?.[locale] ?? entry.label;
}

/**
 * アプリの表示名を **key だけ**から解決する。
 *
 * `appLabel` は `AppEntry` を要るが、アプリ一覧を写した行（`lib/app-flags.ts` の
 * SY05 の行など）は key と ja のラベルしか持っていない。そこで ja のまま出して
 * いたので、英語・中国語でもアプリ管理の一覧だけ日本語で並んでいた。
 */
export function appLabelForKey(
  key: string,
  fallbackJa: string,
  locale: Locale,
): string {
  if (locale === "ja") return fallbackJa;
  return APP_LABEL_I18N[key]?.[locale] ?? fallbackJa;
}

/** カテゴリの表示名を言語ごとに解決する。 */
export function categoryLabel(category: AppCategory, locale: Locale): string {
  if (locale === "ja") return category;
  return CATEGORY_LABEL_I18N[category]?.[locale] ?? category;
}

/**
 * Returns apps grouped by category, preserving the order above.
 */
export function getAppsByCategory(): Array<{
  category: AppCategory;
  apps: AppEntry[];
  color: string;
}> {
  const order: AppCategory[] = [
    "一般",
    "販売",
    "購買",
    "生産",
    "出荷",
    "請求",
    "マスタ",
    "ドキュメント",
    "システム",
  ];
  return order.map((category) => ({
    category,
    apps: appList.filter((app) => app.category === category),
    color: CATEGORY_COLORS[category],
  }));
}
