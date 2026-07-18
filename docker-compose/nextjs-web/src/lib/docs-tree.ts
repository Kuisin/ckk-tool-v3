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
    ],
  },
  {
    title: {
      ja: "アプリ操作マニュアル",
      en: "App User Guides",
      zh: "应用操作手册",
    },
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
    ],
  },
  {
    // 参照マスタの操作マニュアル（本番公開マスタのみ）。
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
        slug: "masters/product/user",
        title: {
          ja: "製品 — 操作マニュアル",
          en: "Product — User Manual",
          zh: "产品 — 操作手册",
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
        slug: "masters/approval-group/user",
        title: {
          ja: "承認グループ — 操作マニュアル",
          en: "Approval Group — User Manual",
          zh: "审批组 — 操作手册",
        },
      },
    ],
  },
  {
    // 設定（カスタマイズ）画面を持つアプリのみ。現状は 試算計算（SY02）のみ。
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
];

const ALL_PAGES: DocPage[] = DOCS_TREE.flatMap((s) => s.pages);

export function findDocPage(slug: string): DocPage | undefined {
  return ALL_PAGES.find((p) => p.slug === slug);
}
