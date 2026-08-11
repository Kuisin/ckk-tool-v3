/**
 * docs-tree.ts — /docs のツリー定義（言語・セクション・ページ）。client-safe.
 *
 * フォルダ構造がページ構成を表し、ファイル名が言語を表す
 * （`src/content/docs/<slug>/<lang>.md`）。Markdown 読み出し（fs）はサーバー専用の
 * lib/docs.ts 側。ここは型と定数のみでクライアント（サイドバー）からも参照できる。
 */

export const DOCS_LANGS = ["ja", "en", "zh"] as const;
export type DocLang = (typeof DOCS_LANGS)[number];

export const DOC_LANG_LABEL: Record<DocLang, string> = {
  ja: "日本語",
  en: "English",
  zh: "中文",
};

export function isDocLang(v: string | undefined): v is DocLang {
  return v === "ja" || v === "en" || v === "zh";
}

export interface DocPage {
  /** フォルダパス（= ページの slug）。 */
  slug: string;
  title: Record<DocLang, string>;
}

export interface DocSection {
  title: Record<DocLang, string>;
  pages: DocPage[];
}

/** マニュアル構成（セクション → ページ）。フォルダ構造と一致。 */
export const DOCS_TREE: DocSection[] = [
  {
    title: { ja: "はじめに", en: "Getting Started", zh: "入门" },
    pages: [
      {
        slug: "start",
        title: { ja: "スタートマニュアル", en: "Start Manual", zh: "开始手册" },
      },
      {
        slug: "user-settings",
        title: {
          ja: "ユーザー設定マニュアル",
          en: "User Settings Manual",
          zh: "用户设置手册",
        },
      },
      {
        slug: "using-docs",
        title: {
          ja: "マニュアルの使い方",
          en: "Using the Manuals",
          zh: "手册使用方法",
        },
      },
    ],
  },
  {
    // 販売（SA）アプリの操作マニュアル。
    title: { ja: "販売アプリ", en: "Sales Apps", zh: "销售应用" },
    pages: [
      {
        slug: "apps/trial-estimate/user",
        title: {
          ja: "試算 — 操作マニュアル",
          en: "Trial Estimate — User Manual",
          zh: "试算 — 操作手册",
        },
      },
      {
        slug: "apps/price-list/user",
        title: {
          ja: "価格表 — 操作マニュアル",
          en: "Price List — User Manual",
          zh: "价格表 — 操作手册",
        },
      },
      {
        slug: "apps/quote/user",
        title: {
          ja: "見積書 — 操作マニュアル",
          en: "Quote — User Manual",
          zh: "报价单 — 操作手册",
        },
      },
      {
        slug: "apps/order-acceptance/user",
        title: {
          ja: "受注請書 — 操作マニュアル",
          en: "Order Acceptance — User Manual",
          zh: "订单受理 — 操作手册",
        },
      },
      {
        slug: "apps/design-request/user",
        title: {
          ja: "設計依頼書 — 操作マニュアル",
          en: "Design Request — User Manual",
          zh: "设计委托单 — 操作手册",
        },
      },
    ],
  },
  {
    // 購買（PU）アプリの操作マニュアル。
    title: { ja: "購買アプリ", en: "Purchasing Apps", zh: "采购应用" },
    pages: [
      {
        slug: "apps/purchase-request/user",
        title: {
          ja: "購買依頼 — 操作マニュアル",
          en: "Purchase Request — User Manual",
          zh: "采购申请 — 操作手册",
        },
      },
      {
        slug: "apps/purchase-order/user",
        title: {
          ja: "素材発注書 — 操作マニュアル",
          en: "Material Purchase Order — User Manual",
          zh: "素材订购单 — 操作手册",
        },
      },
      {
        slug: "apps/material-receipt/user",
        title: {
          ja: "素材入荷 — 操作マニュアル",
          en: "Material Receipt — User Manual",
          zh: "素材入库 — 操作手册",
        },
      },
      {
        slug: "apps/outsource-order/user",
        title: {
          ja: "外注依頼 — 操作マニュアル",
          en: "Outsource Order — User Manual",
          zh: "外协委托 — 操作手册",
        },
      },
    ],
  },
  {
    // 生産（PD）アプリの操作マニュアル。
    title: { ja: "生産アプリ", en: "Production Apps", zh: "生产应用" },
    pages: [
      {
        slug: "apps/work-order/user",
        title: {
          ja: "指示書 — 操作マニュアル",
          en: "Work Order — User Manual",
          zh: "指示单 — 操作手册",
        },
      },
      {
        slug: "apps/approval/user",
        title: {
          ja: "承認管理 — 操作マニュアル",
          en: "Approvals — User Manual",
          zh: "审批管理 — 操作手册",
        },
      },
      {
        slug: "apps/product-inventory/user",
        title: {
          ja: "製品在庫 — 操作マニュアル",
          en: "Product Inventory — User Manual",
          zh: "产品库存 — 操作手册",
        },
      },
      {
        slug: "apps/material-inventory/user",
        title: {
          ja: "素材在庫 — 操作マニュアル",
          en: "Material Inventory — User Manual",
          zh: "素材库存 — 操作手册",
        },
      },
    ],
  },
  {
    // 出荷（SH）・請求（BL）アプリの操作マニュアル。
    title: {
      ja: "出荷・請求アプリ",
      en: "Shipping & Billing Apps",
      zh: "发货与请款应用",
    },
    pages: [
      {
        slug: "apps/shipping-order/user",
        title: {
          ja: "出荷書 — 操作マニュアル",
          en: "Shipping Order — User Manual",
          zh: "发货单 — 操作手册",
        },
      },
      {
        slug: "apps/delivery-note/user",
        title: {
          ja: "納品書 — 操作マニュアル",
          en: "Delivery Note — User Manual",
          zh: "送货单 — 操作手册",
        },
      },
      {
        slug: "apps/invoice/user",
        title: {
          ja: "請求書 — 操作マニュアル",
          en: "Invoice — User Manual",
          zh: "请款单 — 操作手册",
        },
      },
      {
        slug: "apps/billing-closing/user",
        title: {
          ja: "締日処理 — 操作マニュアル",
          en: "Billing Closing — User Manual",
          zh: "结算处理 — 操作手册",
        },
      },
    ],
  },
  {
    // 参照マスタの操作マニュアル。
    title: {
      ja: "マスタ操作マニュアル",
      en: "Master Data Guides",
      zh: "主数据操作手册",
    },
    pages: [
      {
        slug: "masters/customer/user",
        title: {
          ja: "顧客 — 操作マニュアル",
          en: "Customer — User Manual",
          zh: "客户 — 操作手册",
        },
      },
      {
        slug: "masters/end-user/user",
        title: {
          ja: "最終需要家 — 操作マニュアル",
          en: "End User — User Manual",
          zh: "最终用户 — 操作手册",
        },
      },
      {
        slug: "masters/product/user",
        title: {
          ja: "製品 — 操作マニュアル",
          en: "Product — User Manual",
          zh: "产品 — 操作手册",
        },
      },
      {
        slug: "masters/material-type/user",
        title: {
          ja: "材種 — 操作マニュアル",
          en: "Material Type — User Manual",
          zh: "材种 — 操作手册",
        },
      },
      {
        slug: "masters/material/user",
        title: {
          ja: "素材 — 操作マニュアル",
          en: "Material — User Manual",
          zh: "素材 — 操作手册",
        },
      },
      {
        slug: "masters/supplier/user",
        title: {
          ja: "外注企業 — 操作マニュアル",
          en: "Supplier — User Manual",
          zh: "外协企业 — 操作手册",
        },
      },
      {
        slug: "masters/process-step/user",
        title: {
          ja: "工程マスタ — 操作マニュアル",
          en: "Process Step Master — User Manual",
          zh: "工序主数据 — 操作手册",
        },
      },
      {
        slug: "masters/inspection-template/user",
        title: {
          ja: "検査表テンプレート — 操作マニュアル",
          en: "Inspection Template — User Manual",
          zh: "检查表模板 — 操作手册",
        },
      },
      {
        slug: "masters/defect-type/user",
        title: {
          ja: "不良種類 — 操作マニュアル",
          en: "Defect Type — User Manual",
          zh: "不良类型 — 操作手册",
        },
      },
      {
        slug: "masters/approval-group/user",
        title: {
          ja: "承認グループ — 操作マニュアル",
          en: "Approval Group — User Manual",
          zh: "审批组 — 操作手册",
        },
      },
      {
        slug: "masters/factory/user",
        title: {
          ja: "工場 — 操作マニュアル",
          en: "Factory — User Manual",
          zh: "工厂 — 操作手册",
        },
      },
      {
        slug: "masters/material-numbering/user",
        title: {
          ja: "採番構成 — 操作マニュアル",
          en: "Numbering Structure — User Manual",
          zh: "编号构成 — 操作手册",
        },
      },
    ],
  },
  {
    // 設定（カスタマイズ）画面を持つアプリのみ。
    title: {
      ja: "アプリ設定マニュアル",
      en: "App Settings Guides",
      zh: "应用设置手册",
    },
    pages: [
      {
        slug: "apps/trial-estimate/settings",
        title: {
          ja: "試算計算 — 設定マニュアル",
          en: "Trial Calculation — Settings Manual",
          zh: "试算计算 — 设置手册",
        },
      },
      {
        slug: "apps/product-type/settings",
        title: {
          ja: "製品項目 — 設定マニュアル",
          en: "Product Items — Settings Manual",
          zh: "产品项目 — 设置手册",
        },
      },
    ],
  },
  {
    // システム管理者向け（SY01/SY05〜SY09 など）
    title: {
      ja: "システム管理マニュアル",
      en: "System Administration Guides",
      zh: "系统管理手册",
    },
    pages: [
      {
        slug: "system/user-management",
        title: {
          ja: "ユーザー管理 — 操作マニュアル",
          en: "User Management — User Manual",
          zh: "用户管理 — 操作手册",
        },
      },
      {
        slug: "system/app-management",
        title: {
          ja: "アプリ管理 — 操作マニュアル",
          en: "App Management — User Manual",
          zh: "应用管理 — 操作手册",
        },
      },
      {
        slug: "system/file-management",
        title: {
          ja: "ファイル管理 — 操作マニュアル",
          en: "File Management — User Manual",
          zh: "文件管理 — 操作手册",
        },
      },
      {
        slug: "system/activity-log",
        title: {
          ja: "操作履歴 — 操作マニュアル",
          en: "Activity Log — User Manual",
          zh: "操作历史 — 操作手册",
        },
      },
      {
        slug: "system/kiosk-cards",
        title: {
          ja: "QRカード管理 — 操作マニュアル",
          en: "QR Card Management — User Manual",
          zh: "QR卡管理 — 操作手册",
        },
      },
      {
        slug: "system/kiosk-devices",
        title: {
          ja: "端末管理 — 操作マニュアル",
          en: "Kiosk Device Management — User Manual",
          zh: "终端管理 — 操作手册",
        },
      },
      {
        slug: "system/kiosk-device-setup",
        title: {
          ja: "キオスク端末セットアップ",
          en: "Kiosk Device Setup",
          zh: "自助终端设备设置",
        },
      },
    ],
  },
];

const ALL_PAGES: DocPage[] = DOCS_TREE.flatMap((s) => s.pages);

export function findDocPage(slug: string): DocPage | undefined {
  return ALL_PAGES.find((p) => p.slug === slug);
}
