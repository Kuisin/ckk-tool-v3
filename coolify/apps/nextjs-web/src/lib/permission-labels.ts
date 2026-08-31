/**
 * permission-labels.ts — 権限コード・アクション・スコープの表示名（ja / en / zh）。
 *
 * **画面に権限コードを生で出さない**ための 1 箇所。これまで SY01 の実効権限は
 * `quote` `kiosk_secret` のようなコードをそのまま並べていて、利用者には
 * 「何ができる権限なのか」が読めなかった。マニュアルにも同じ名前で書けるよう、
 * ラベルはここだけに置く。
 *
 * ■ 日本語が原本
 * `messages/*.json` と同じ約束で、**ja を先に書き、en / zh はその訳**。
 * 迷ったら ja の文言を直してから訳し直すこと。
 *
 * ■ DB の app.permissions.display_name との関係
 * DB 側にも表示名の列があるが、**画面とマニュアルはこちらを読む**。理由は 2 つ:
 *   - マニュアルはビルド時に組み立てるので DB を引けない
 *   - DB 側は ja / en だけで zh が無い
 * DB の列は psql や BI で読むときの手掛かりとして残す。両者が食い違わないよう、
 * permission-labels.test.ts が「seed に有るコードはここにも有る」を検査する。
 *
 * ■ 権限は「コード × アクション × スコープ」の 3 つで決まる
 *   コード     … 何に対する権限か（見積書 / 在庫 / …）
 *   アクション … その中で何ができるか（閲覧 / 作成 / 更新 / 削除 / 書き出し）
 *   スコープ   … どこまでの範囲か（全社 / 拠点 / 自分の担当）
 * 承認だけは例外で、**アクションでは決まらない** — 誰が承認できるかは承認設定
 * (MS0B) の承認グループ所属が決める（`lib/authz.ts` checkApprovalDocAccess）。
 */

import type { Locale } from "@/lib/i18n";

/** 3 言語ぶんの文言。ja が原本。 */
export interface LocalizedLabel {
  ja: string;
  en: string;
  zh: string;
}

/** 権限の性格。マニュアルの一覧をこの順・この区分で並べる。 */
export type PermissionGroup =
  | "business" // 日々の業務で使う
  | "master" // マスタと設定
  | "admin" // 管理者向け
  | "privileged"; // 申請と承認が要る特権操作

export interface PermissionMeta {
  code: string;
  label: LocalizedLabel;
  /** 「この権限があると何ができるか」の 1 行。 */
  summary: LocalizedLabel;
  group: PermissionGroup;
}

export const PERMISSION_GROUP_LABEL: Record<PermissionGroup, LocalizedLabel> = {
  business: { ja: "業務", en: "Business", zh: "业务" },
  master: {
    ja: "マスタ・設定",
    en: "Master data & settings",
    zh: "主数据与设置",
  },
  admin: { ja: "管理", en: "Administration", zh: "管理" },
  privileged: {
    ja: "特権操作（申請と承認が要る）",
    en: "Privileged (request & approval required)",
    zh: "特权操作（需申请与批准）",
  },
};

/** 種類ごとの説明。「権限にはどんな種類があるのか」をマニュアルで語るための 1 段落。 */
export const PERMISSION_GROUP_SUMMARY: Record<PermissionGroup, LocalizedLabel> =
  {
    business: {
      ja: "日々の仕事で使う権限です。見積書・注文請書・指示書・出荷書のように、扱う書類ごとに分かれています。多くの人はここだけを持ちます。",
      en: "Permissions for everyday work, split by the document you handle — quotes, order acceptances, work orders, delivery orders. Most people hold only these.",
      zh: "日常工作使用的权限，按所处理的单据划分——报价单、订单确认书、作业指示书、出货单。大多数人只持有这一类。",
    },
    master: {
      ja: "全員が共通で使う「元になるデータ」を整える権限です。取引先や製品を直すと、その後に作られる書類すべてに影響します。人数を絞って持つのが普通です。",
      en: "Permissions for the shared reference data everyone works from. Changing a partner or product affects every document created afterwards, so these are usually held by a few people.",
      zh: "整理全员共用的「基础数据」的权限。修改客户或产品会影响此后创建的所有单据，因此通常只由少数人持有。",
    },
    admin: {
      ja: "システムそのものの設定を変える権限です。画面の見え方や外部連携など、業務データではなく仕組みの側を扱います。",
      en: "Permissions that change the system itself — how screens behave, external integrations — rather than business data.",
      zh: "更改系统本身设置的权限，涉及画面行为与外部对接等机制层面，而非业务数据。",
    },
    privileged: {
      ja: "持っているだけでは実行できない権限です。端末の PIN やカードの発行、個人データの閲覧など、影響が大きく後戻りしにくい操作がここに入ります。使うたびに申請し、別の人の承認を受けた期間だけ実行できます。",
      en: "Permissions that holding is not enough for. Device PINs, card issuance and personal-data access sit here — operations with wide reach and little way back. Each use is requested and allowed only for a window someone else approves.",
      zh: "仅持有还不能执行的权限。终端 PIN、卡片发放、个人数据查看等影响大且难以回退的操作属于此类。每次使用都需申请，并只在他人批准的时间段内执行。",
    },
  };

/**
 * 権限コードの一覧。**app.permissions に入るコードと同じ集合**
 * （shared-db/sql/rbac-seed.sql + migrations）。
 */
export const PERMISSIONS: readonly PermissionMeta[] = [
  // ── 業務 ────────────────────────────────────────────────────────────────
  {
    code: "price_list",
    label: { ja: "価格表", en: "Price list", zh: "价格表" },
    summary: {
      ja: "価格試算と価格表を扱えます。顧客ごとの単価を決める権限です。",
      en: "Work with price estimates and price lists — the per-customer unit prices.",
      zh: "处理价格试算与价格表，即各客户的单价。",
    },
    group: "business",
  },
  {
    code: "quote",
    label: { ja: "見積書", en: "Quote", zh: "报价单" },
    summary: {
      ja: "見積書を扱えます。",
      en: "Work with quotes.",
      zh: "处理报价单。",
    },
    group: "business",
  },
  {
    code: "order_acceptance",
    label: {
      ja: "注文請書・注文明細",
      en: "Order acceptance",
      zh: "订单确认书・订单明细",
    },
    summary: {
      ja: "注文請書と、その明細（注文明細）を扱えます。",
      en: "Work with order acceptances and their lines.",
      zh: "处理订单确认书及其明细。",
    },
    group: "business",
  },
  {
    code: "design_request",
    label: { ja: "設計依頼", en: "Design request", zh: "设计委托" },
    summary: {
      ja: "設計依頼書を扱えます。図面そのものは「設計図」の権限です。",
      en: "Work with design requests. The drawings themselves are covered by the drawing permission.",
      zh: "处理设计委托单。图纸本身由「图纸」权限管理。",
    },
    group: "business",
  },
  {
    code: "design_file",
    label: { ja: "設計図", en: "Drawing", zh: "图纸" },
    summary: {
      ja: "図面の版を登録・編集・削除できます。閲覧は業務ロールのほぼ全員が持ちます。",
      en: "Register, edit and delete drawing versions. Nearly every business role can view them.",
      zh: "登记、编辑和删除图纸版本。几乎所有业务角色都可查看。",
    },
    group: "business",
  },
  {
    code: "purchase_order",
    label: {
      ja: "素材発注・購買依頼",
      en: "Purchasing",
      zh: "材料订购・采购申请",
    },
    summary: {
      ja: "購買依頼と素材発注書を扱えます。",
      en: "Work with purchase requests and material purchase orders.",
      zh: "处理采购申请与材料订购单。",
    },
    group: "business",
  },
  {
    code: "material_receipt",
    label: { ja: "素材入荷", en: "Material receipt", zh: "材料入库" },
    summary: {
      ja: "素材の入荷を記録できます。",
      en: "Record incoming material.",
      zh: "登记材料入库。",
    },
    group: "business",
  },
  {
    code: "outsource_order",
    label: { ja: "外注依頼", en: "Outsource order", zh: "外协委托" },
    summary: {
      ja: "外注依頼を扱えます。",
      en: "Work with outsourcing orders.",
      zh: "处理外协委托。",
    },
    group: "business",
  },
  {
    code: "work_order",
    label: { ja: "指示書", en: "Work order", zh: "作业指示书" },
    summary: {
      ja: "指示書と工程の実行を扱えます。現場のタブレット（共有端末）の工程実行もこの権限です。",
      en: "Work with work orders and step execution — including the shop-floor kiosk.",
      zh: "处理作业指示书与工序执行，包括车间平板（共用终端）。",
    },
    group: "business",
  },
  {
    code: "inventory",
    label: { ja: "在庫", en: "Inventory", zh: "库存" },
    summary: {
      ja: "製品・素材・仕掛の在庫を見て、移動や調整ができます。",
      en: "View product, material and WIP stock, and move or adjust it.",
      zh: "查看产品・材料・在制品库存，并进行移动或调整。",
    },
    group: "business",
  },
  {
    code: "delivery_order",
    label: { ja: "出荷書", en: "Delivery order", zh: "出货单" },
    summary: {
      ja: "出荷書を扱えます。",
      en: "Work with delivery orders.",
      zh: "处理出货单。",
    },
    group: "business",
  },
  {
    code: "delivery_note",
    label: { ja: "納品書", en: "Delivery note", zh: "送货单" },
    summary: {
      ja: "納品書を扱えます。",
      en: "Work with delivery notes.",
      zh: "处理送货单。",
    },
    group: "business",
  },
  {
    code: "invoice",
    label: { ja: "請求書", en: "Invoice", zh: "请款单" },
    summary: {
      ja: "請求書を扱えます。",
      en: "Work with invoices.",
      zh: "处理请款单。",
    },
    group: "business",
  },
  {
    code: "billing_closing",
    label: { ja: "締日処理", en: "Billing closing", zh: "结账处理" },
    summary: {
      ja: "締日処理と、会計へ渡す書き出しができます。",
      en: "Run billing closings and export for accounting.",
      zh: "执行结账处理并导出至会计。",
    },
    group: "business",
  },
  {
    code: "approve",
    label: { ja: "承認管理", en: "Approvals", zh: "审批管理" },
    summary: {
      ja: "承認依頼中の一覧（承認・予定）を見られます。実際に承認できるかどうかは、この権限ではなく承認設定（MS0B）で決まります。",
      en: "See the pending-approval list. Whether you may actually approve is decided by 承認設定 (MS0B), not by this permission.",
      zh: "查看待审批列表。能否实际审批由审批设置（MS0B）决定，而非此权限。",
    },
    group: "business",
  },
  {
    code: "form",
    label: { ja: "フォーム", en: "Forms", zh: "表单" },
    summary: {
      ja: "フォームの作成・編集と、全回答の閲覧ができます。誰が回答できるかはフォームごとの共有設定が決めます。",
      en: "Create and edit forms and read every response. Who may respond is set per form.",
      zh: "创建、编辑表单并查看全部回答。谁可以回答由各表单的共享设置决定。",
    },
    group: "business",
  },
  {
    code: "internal_page",
    label: { ja: "社内文書", en: "Internal pages", zh: "内部文档" },
    summary: {
      ja: "社内文書アプリを使えます。個々の文書が見えるかは文書ごとの共有設定が決めます。",
      en: "Use the internal-documents app. Visibility of each document is set per document.",
      zh: "使用内部文档应用。各文档是否可见由该文档的共享设置决定。",
    },
    group: "business",
  },

  // ── マスタ・設定 ─────────────────────────────────────────────────────────
  {
    code: "master",
    label: { ja: "マスタ管理", en: "Master data", zh: "主数据管理" },
    summary: {
      ja: "取引先・製品・材種・素材・工程・検査表・承認設定・拠点などのマスタを扱えます。",
      en: "Work with master data: partners, products, materials, process steps, inspection templates, approval settings, plants and more.",
      zh: "处理主数据：客户、产品、材种、材料、工序、检验表、审批设置、基地等。",
    },
    group: "master",
  },
  {
    code: "admin_manual",
    label: { ja: "管理マニュアル", en: "Admin manual", zh: "管理手册" },
    summary: {
      ja: "端末セットアップなど、管理者向けの手順書を読めます（公開マニュアルとは別の権限です）。",
      en: "Read the administrator-facing runbooks such as device setup (separate from the public manual).",
      zh: "阅读面向管理员的操作手册，如终端设置（与公开手册是不同的权限）。",
    },
    group: "master",
  },

  // ── 管理 ────────────────────────────────────────────────────────────────
  {
    code: "system",
    label: { ja: "システム管理", en: "System admin", zh: "系统管理" },
    summary: {
      ja: "アプリ設定・価格試算計算・リンク管理・注文書取込・AI プロバイダ・通知メールなど、システム側の設定を扱えます。",
      en: "Change system-side settings: app management, price estimate engine, links, order intake, AI provider, notification email.",
      zh: "更改系统侧设置：应用管理、价格试算计算、链接管理、订单导入、AI 提供方、通知邮件。",
    },
    group: "admin",
  },
  {
    code: "kiosk",
    label: {
      ja: "共有端末管理",
      en: "Shared device admin",
      zh: "共用终端管理",
    },
    summary: {
      ja: "共有端末の一覧・詳細を見て、名称や設置場所を直せます。**秘密の開示や端末の登録・失効は別の権限**（下の特権操作）です。",
      en: "View shared devices and edit their name and location. **Revealing secrets and enrolling or revoking devices are separate** (see privileged operations).",
      zh: "查看共享终端并修改名称与位置。**查看机密、注册或注销终端属于另外的权限**（见特权操作）。",
    },
    group: "admin",
  },

  // ── 特権操作 ────────────────────────────────────────────────────────────
  {
    code: "kiosk_secret",
    label: {
      ja: "共有端末の秘密",
      en: "Shared device secrets",
      zh: "共用终端机密",
    },
    summary: {
      ja: "メンテナンス退出 PIN・PIN 履歴・端末設定コードの開示と再生成、端末鍵のリセット。",
      en: "Reveal the maintenance-exit PIN, PIN history and device settings code; regenerate codes and reset the device key.",
      zh: "查看维护退出 PIN、PIN 历史与终端设置码，重新生成设置码并重置终端密钥。",
    },
    group: "privileged",
  },
  {
    code: "kiosk_device",
    label: {
      ja: "端末アクセスの付与",
      en: "Shared device enrolment",
      zh: "终端访问授予",
    },
    summary: {
      ja: "端末プロファイルの作成・リンク・有効化・停止・失効。端末を入れることはアクセスを与えることです。",
      en: "Create, link, activate, disable and revoke device profiles. Adding a device grants access.",
      zh: "创建、绑定、启用、停用与注销终端配置。加入终端即等于授予访问权限。",
    },
    group: "privileged",
  },
  {
    code: "kiosk_card",
    label: {
      ja: "QRカードの発行・PIN",
      en: "Shared device card issuance",
      zh: "二维码卡发放・PIN",
    },
    summary: {
      ja: "QRカードの一覧を見られます。発行・割当・失効・PIN のリセット・台紙の印刷は承認が要ります。",
      en: "See the card list. Issuing, assigning, revoking, resetting PINs and printing sheets need approval.",
      zh: "查看卡片列表。发放、分配、注销、重置 PIN 与打印卡纸需要批准。",
    },
    group: "privileged",
  },
  {
    code: "personal_data",
    label: {
      ja: "個人データの閲覧",
      en: "Personal data access",
      zh: "个人数据查看",
    },
    summary: {
      ja: "ログイン履歴と操作履歴を開けます。詳細（IP・端末シグネチャ）と横断検索は承認が要ります。書類ごとの履歴タブはこの権限では制限しません。",
      en: "Open login and activity history. Details (IP, device signature) and cross-document search need approval. Per-document history tabs are not restricted by this.",
      zh: "打开登录历史与操作历史。明细（IP、终端签名）与跨单据检索需要批准。各单据的历史页签不受此限制。",
    },
    group: "privileged",
  },
  {
    code: "user_admin",
    label: {
      ja: "ユーザー・権限の変更",
      en: "User administration",
      zh: "用户・权限变更",
    },
    summary: {
      ja: "ユーザー管理を開けます。利用停止・復帰・所属拠点の変更は、1 件ずつ変更依頼を出して承認を受けます。",
      en: "Open user management. Suspending, restoring and changing plants go through a per-change approval.",
      zh: "打开用户管理。停用、恢复与变更所属基地需逐项提交变更申请并获批准。",
    },
    group: "privileged",
  },
  {
    code: "portal_admin",
    label: {
      ja: "取引先ポータルの管理",
      en: "Partner portal administration",
      zh: "客户门户管理",
    },
    summary: {
      ja: "社外の人（取引先・需要家）が自社宛の書類を見るためのアカウントと、書類 1 件へのリンクを管理します。有効化・バックアップコードの発行・本人確認なしリンクの発行は、1 件ずつ承認を受けます。",
      en: "Manage the accounts external partners use to view their own documents, and the per-document links. Activating an account, issuing backup codes and minting link-only URLs each need approval.",
      zh: "管理外部客户查看自身单据所用的账号，以及单据链接。启用账号、发放备用码、发放免验证链接均需逐项获得批准。",
    },
    group: "privileged",
  },
];

const BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));

/** 権限コードの定義。未知のコードは null。 */
export function permissionMeta(code: string): PermissionMeta | null {
  return BY_CODE.get(code) ?? null;
}

/** 表示名。未知のコードはコードをそのまま返す（画面が空欄にならないように）。 */
export function permissionLabel(code: string, locale: Locale = "ja"): string {
  return BY_CODE.get(code)?.label[locale] ?? code;
}

/** 「この権限があると何ができるか」。未知のコードは空文字。 */
export function permissionSummary(code: string, locale: Locale = "ja"): string {
  return BY_CODE.get(code)?.summary[locale] ?? "";
}

/** 「見積書（quote）」— 画面で名前とコードを並べたいとき。 */
export function permissionLabelWithCode(
  code: string,
  locale: Locale = "ja",
): string {
  const meta = BY_CODE.get(code);
  return meta ? `${meta.label[locale]}（${code}）` : code;
}

/** app.ACTION — その権限の中で何ができるか。 */
export const ACTION_LABEL: Record<string, LocalizedLabel> = {
  READ: { ja: "閲覧", en: "View", zh: "查看" },
  CREATE: { ja: "作成", en: "Create", zh: "创建" },
  UPDATE: { ja: "更新", en: "Edit", zh: "更新" },
  DELETE: { ja: "削除", en: "Delete", zh: "删除" },
  EXPORT: { ja: "書き出し", en: "Export", zh: "导出" },
  APPROVE: { ja: "承認", en: "Approve", zh: "审批" },
  ADMIN: { ja: "管理", en: "Administer", zh: "管理" },
};

/** app.SCOPE — どこまでの範囲に及ぶか。 */
export const SCOPE_LABEL: Record<string, LocalizedLabel> = {
  ALL: { ja: "全社", en: "Company-wide", zh: "全公司" },
  REGION: { ja: "地域", en: "Region", zh: "地区" },
  COUNTRY: { ja: "国", en: "Country", zh: "国家" },
  PLANT: { ja: "拠点", en: "Plant", zh: "基地" },
  DEPARTMENT: { ja: "部門", en: "Department", zh: "部门" },
  TEAM: { ja: "チーム", en: "Team", zh: "团队" },
  SUB: { ja: "配下", en: "Subordinates", zh: "下属" },
  OWN: { ja: "自分の担当", en: "Own records", zh: "本人负责的记录" },
};

export function actionLabel(action: string, locale: Locale = "ja"): string {
  return ACTION_LABEL[action]?.[locale] ?? action;
}

export function scopeLabel(scope: string, locale: Locale = "ja"): string {
  return SCOPE_LABEL[scope]?.[locale] ?? scope;
}

/** マニュアルの一覧を出す順。 */
export const PERMISSION_GROUP_ORDER: readonly PermissionGroup[] = [
  "business",
  "master",
  "admin",
  "privileged",
];

export function permissionsByGroup(group: PermissionGroup): PermissionMeta[] {
  return PERMISSIONS.filter((p) => p.group === group);
}
