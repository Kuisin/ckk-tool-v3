/**
 * manual-permissions.ts — マニュアル各ページの「必要な権限」欄を組み立てる。
 *
 * 「この画面を使うには何の権限が要るのか」は、権限がなくて弾かれてから探すもの
 * なので、アプリごとのページに書いてある必要がある。ただし 46 ページ × 3 言語を
 * 手で書くと必ず腐るので、**コード側の登録簿から組み立てて埋め込む**:
 *   lib/app-list.ts            … アプリ → 必要な権限コード
 *   lib/permission-labels.ts   … 権限コード → 表示名（ja/en/zh）
 *   lib/privileged-operations.ts … 承認が要る操作
 *
 * 埋め込みは `<!-- permissions:start -->` 〜 `<!-- permissions:end -->` の間だけ。
 * 何度流しても同じ結果になり、その外側の本文には触らない。
 *
 * 中身が実ファイルと一致しているかは manual-permissions.test.ts が検査する。
 * 権限を付け替えたのにマニュアルが古いままなら落ちる（field-help.test.ts と
 * 同じ考え方 — 参照が腐ったまま放置されない）。
 *
 * 更新のしかた:
 *   UPDATE_MANUAL=1 pnpm test -- src/lib/manual-permissions.test.ts
 */

import { appList } from "@/lib/app-list";
import type { Locale } from "@/lib/i18n";
import {
  actionLabel,
  PERMISSION_GROUP_LABEL,
  PERMISSION_GROUP_ORDER,
  PERMISSION_GROUP_SUMMARY,
  permissionLabel,
  permissionsByGroup,
  scopeLabel,
} from "@/lib/permission-labels";
import { PRIVILEGED_OPERATIONS } from "@/lib/privileged-operations";

export const BLOCK_START = "<!-- permissions:start -->";
export const BLOCK_END = "<!-- permissions:end -->";

/**
 * マニュアルのページ → その画面が要求する権限。
 *
 * `app` は lib/app-list.ts の key。キオスク端末側の画面のように nextjs-web の
 * アプリ一覧に無いものは `code` で直に指定する（`code: null` = ログインのみ）。
 */
interface ManualPageSource {
  /** content/manual からの相対パス（ロケール接尾辞と拡張子は除く）。 */
  path: string;
  app?: string;
  code?: string | null;
  /** 特権操作を引くときのアプリ key（app と違う場合のみ）。 */
  privilegedAppKey?: string;
}

export const MANUAL_PAGES: readonly ManualPageSource[] = [
  // ── 販売 ────────────────────────────────────────────────────────────────
  { path: "operations/sales/trial-estimate/user", app: "trial-estimates" },
  { path: "operations/sales/price-list/user", app: "price-lists" },
  { path: "operations/sales/quote/user", app: "quotes" },
  { path: "operations/sales/order-acceptance/user", app: "order-acceptances" },
  { path: "operations/sales/order-line/user", app: "order-lines" },
  { path: "operations/sales/design-request/user", app: "design-requests" },
  // ── 購買 ────────────────────────────────────────────────────────────────
  {
    path: "operations/purchasing/purchase-request/user",
    app: "purchase-requests",
  },
  { path: "operations/purchasing/purchase-order/user", app: "purchase-orders" },
  {
    path: "operations/purchasing/material-receipt/user",
    app: "material-receipts",
  },
  {
    path: "operations/purchasing/outsource-order/user",
    app: "outsource-orders",
  },
  // ── 生産 ────────────────────────────────────────────────────────────────
  { path: "operations/production/work-order/user", app: "work-orders" },
  {
    path: "operations/production/pending-work-order/user",
    app: "pending-work-orders",
  },
  { path: "operations/production/design-file/user", app: "design-files" },
  { path: "operations/production/product-inventory/user", app: "inventory" },
  { path: "operations/production/material-inventory/user", app: "inventory" },
  // 旧 承認管理（PD03）は 一般カテゴリの 承認・予定（CM01）へ移設した。画面自体は
  // ログインだけで開くが、承認依頼中の一覧が出るかは approve:READ で決まる。
  // ── 出荷 ────────────────────────────────────────────────────────────────
  { path: "operations/shipping/delivery-order/user", app: "delivery-orders" },
  { path: "operations/shipping/delivery-note/user", app: "delivery-notes" },
  {
    path: "operations/shipping/pending-shipment/user",
    app: "pending-shipments",
  },
  // ── 請求 ────────────────────────────────────────────────────────────────
  { path: "operations/billing/invoice/user", app: "invoices" },
  { path: "operations/billing/billing-closing/user", app: "billing-closings" },
  // ── 一般 ────────────────────────────────────────────────────────────────
  // 旧 承認管理 (PD03) はここへ統合 — my-tasks 自体は無権限で開けるが、
  // 承認依頼中タブは approve 権限がある人にだけ出る（ページ側の判定）。
  { path: "operations/general/my-tasks/user", app: "my-tasks" },
  { path: "operations/general/forms/user", app: "forms" },
  // ── マスタ ──────────────────────────────────────────────────────────────
  {
    path: "operations/masters/business-partner/user",
    app: "master-business-partners",
  },
  { path: "operations/masters/product/user", app: "master-products" },
  {
    path: "operations/masters/material-type/user",
    app: "master-material-types",
  },
  { path: "operations/masters/material/user", app: "master-materials" },
  {
    path: "operations/masters/material-numbering/user",
    app: "master-material-numbering",
  },
  { path: "operations/masters/process-step/user", app: "master-process-steps" },
  {
    path: "operations/masters/inspection-template/user",
    app: "master-inspection-templates",
  },
  { path: "operations/masters/defect-type/user", app: "master-defect-types" },
  {
    path: "operations/masters/approval-setting/user",
    app: "master-approval-groups",
  },
  { path: "operations/masters/plant/user", app: "master-plants" },
  {
    path: "operations/masters/work-location/user",
    app: "master-work-locations",
  },
  {
    path: "operations/masters/storage-location/user",
    app: "master-storage-locations",
  },
  // ── システム ────────────────────────────────────────────────────────────
  { path: "operations/system/user-management/user", app: "user-management" },
  { path: "operations/system/app-management/user", app: "app-management" },
  { path: "operations/system/file-management/user", app: "file-management" },
  { path: "operations/system/activity-log/user", app: "activity-log" },
  { path: "operations/system/login-history/user", app: "login-history" },
  { path: "operations/system/kiosk-card/user", app: "kiosk-cards" },
  { path: "operations/system/kiosk-device/user", app: "kiosk-devices" },
  { path: "operations/system/kiosk-settings/user", app: "kiosk-settings" },
  { path: "operations/system/link-management/user", app: "links" },
  { path: "operations/system/order-intake/user", app: "order-intake" },
  {
    path: "operations/system/privileged-access/user",
    app: "privileged-access",
  },
  // ── キオスク（現場のタブレット。nextjs-web のアプリ一覧には無い）───────────
  // ログイン画面。QRカードと PIN があれば入れる — 権限の話ではない。
  { path: "operations/kiosk/start/user", code: null },
  { path: "operations/kiosk/steps/user", code: "work_order" },
];

/** そのページが要求する権限コード（null = ログインのみ）。 */
export function pageCode(page: ManualPageSource): string | null {
  if (page.app) {
    const app = appList.find((a) => a.key === page.app);
    if (!app) throw new Error(`manual-permissions: 未知のアプリ ${page.app}`);
    return app.requiredPermission;
  }
  return page.code ?? null;
}

/** そのページに出す「承認が要る操作」。 */
export function pageOperations(page: ManualPageSource) {
  const key = page.privilegedAppKey ?? page.app;
  if (!key) return [];
  return PRIVILEGED_OPERATIONS.filter((o) => o.appKey === key);
}

interface Phrases {
  heading: string;
  needs: (label: string, code: string) => string;
  loginOnly: string;
  tableHead: string;
  rowOpen: (label: string) => string;
  rowEdit: (label: string) => string;
  editNote: string;
  approvalHeading: string;
  approvalIntro: string;
  approvalTableHead: string;
  roleNote: string;
  more: string;
}

/** 文言は日本語が原本。en / zh はその訳。 */
const PHRASES: Record<Locale, Phrases> = {
  ja: {
    heading: "## 必要な権限",
    needs: (label, code) =>
      `この画面を使うには **${label}**（\`${code}\`）の権限が要ります。`,
    loginOnly: "この画面に特別な権限は要りません。ログインしていれば使えます。",
    tableHead: "| したいこと | 必要な権限 |\n| --- | --- |",
    rowOpen: (label) => `| 画面を開く・一覧や詳細を見る | ${label} の 閲覧 |`,
    rowEdit: (label) =>
      `| 追加・変更・削除する | ${label} の 作成 / 更新 / 削除 |`,
    editNote:
      "見るだけなら「閲覧」で足ります。追加・変更・削除の操作がある画面では、その操作にあたる権限がそれぞれ必要です。",
    approvalHeading: "### 承認が要る操作",
    approvalIntro:
      "次の操作は権限を持っているだけでは行えません。**特権アクセス（SY0G）で申請し、別の人の承認を受けた期間だけ**行えます。",
    approvalTableHead:
      "| 操作 | 必要な権限 | 何ができるようになるか |\n| --- | --- | --- |",
    roleNote:
      "権限は役割（ロール）を通して付きます。足りないときは管理者に相談してください。",
    more: "権限の全体像は「[権限とロール](../../../permissions)」を参照してください。",
  },
  en: {
    heading: "## Permissions required",
    needs: (label, code) =>
      `Using this screen requires the **${label}** (\`${code}\`) permission.`,
    loginOnly:
      "This screen needs no special permission — being signed in is enough.",
    tableHead: "| What you want to do | Permission needed |\n| --- | --- |",
    rowOpen: (label) =>
      `| Open the screen, view lists and details | ${label} — View |`,
    rowEdit: (label) =>
      `| Add, change or delete | ${label} — Create / Edit / Delete |`,
    editNote:
      "Viewing only needs *View*. Where a screen offers adding, changing or deleting, each of those needs its matching permission.",
    approvalHeading: "### Operations that need approval",
    approvalIntro:
      "Holding the permission is not enough for the operations below. You **request them in Privileged Access (SY0G) and may act only for the window someone else approves**.",
    approvalTableHead:
      "| Operation | Permission | What it unlocks |\n| --- | --- | --- |",
    roleNote:
      "Permissions come through roles. If something is missing, ask an administrator.",
    more: "For the whole picture see [Permissions and roles](../../../permissions).",
  },
  zh: {
    heading: "## 所需权限",
    needs: (label, code) => `使用本画面需要 **${label}**（\`${code}\`）权限。`,
    loginOnly: "本画面不需要特别权限，登录后即可使用。",
    tableHead: "| 想做的事 | 所需权限 |\n| --- | --- |",
    rowOpen: (label) => `| 打开画面、查看列表与明细 | ${label} — 查看 |`,
    rowEdit: (label) => `| 新增・变更・删除 | ${label} — 创建 / 更新 / 删除 |`,
    editNote:
      "仅查看有「查看」即可。画面中若有新增、变更或删除的操作，则分别需要对应的权限。",
    approvalHeading: "### 需要批准的操作",
    approvalIntro:
      "下列操作仅有权限还不够。需**在特权访问（SY0G）中提出申请，并只在他人批准的时间段内执行**。",
    approvalTableHead: "| 操作 | 所需权限 | 可以做什么 |\n| --- | --- | --- |",
    roleNote: "权限通过角色授予。若不足，请与管理员联系。",
    more: "权限的整体说明请参见「[权限与角色](../../../permissions)」。",
  },
};

/** ページ 1 枚ぶんの「必要な権限」欄（マーカーは含まない）。 */
export function buildPermissionBlock(
  page: ManualPageSource,
  locale: Locale,
): string {
  const t = PHRASES[locale];
  const code = pageCode(page);
  const ops = pageOperations(page);
  const lines: string[] = [t.heading, ""];

  if (code === null) {
    lines.push(t.loginOnly);
  } else {
    const label = permissionLabel(code, locale);
    lines.push(t.needs(label, code), "");
    lines.push(t.tableHead);
    lines.push(t.rowOpen(label));
    lines.push(t.rowEdit(label));
    lines.push("", t.editNote);
  }

  if (ops.length > 0) {
    lines.push("", t.approvalHeading, "", t.approvalIntro, "");
    lines.push(t.approvalTableHead);
    for (const op of ops) {
      // 表のセルでは改行できないので、説明中の改行は潰す。
      const desc = op.description[locale].replace(/\s*\n\s*/g, " ");
      // 「どの操作に、どの権限と、どのアクションが要るのか」を 1 行で読めるように、
      // 権限の列にはコードとアクションも入れる（画面の 承認が必要です の表示と対）。
      const perm = `${permissionLabel(op.code, locale)}（\`${op.code}\`）— ${actionLabel(op.action, locale)}`;
      lines.push(`| ${op.label[locale]} | ${perm} | ${desc} |`);
    }
  }

  lines.push("", t.roleNote, "", t.more);
  return lines.join("\n");
}

/** 既存本文にブロックを差し込む / 差し替える（末尾に置く）。 */
export function applyPermissionBlock(source: string, block: string): string {
  const wrapped = `${BLOCK_START}\n${block}\n${BLOCK_END}`;
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start !== -1 && end !== -1) {
    return (
      source.slice(0, start) + wrapped + source.slice(end + BLOCK_END.length)
    );
  }
  return `${source.trimEnd()}\n\n${wrapped}\n`;
}

/** ファイル内の現在のブロック（マーカー間）。無ければ null。 */
export function extractPermissionBlock(source: string): string | null {
  const start = source.indexOf(BLOCK_START);
  const end = source.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return source.slice(start + BLOCK_START.length, end).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// 参照ページ「権限とロール」（content/manual/permissions.md）
//
// 各アプリのページから「権限の全体像は…」で辿る先。一覧は登録簿から組み立てる
// ので、権限コードを足せばここにも自動で載る。
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 実際に効くスコープだけを載せる。COUNTRY / DEPARTMENT / TEAM / SUB は enum に
 * 値はあるが未実装で、付けても何も見えない（fail-closed）— マニュアルに書くと
 * 「設定したのに効かない」を招くので出さない。
 */
const DOCUMENTED_SCOPES = ["ALL", "REGION", "PLANT", "OWN"] as const;

interface ReferencePhrases {
  title: string;
  description: string;
  intro: string;
  authHeading: string;
  authBody: string;
  authTable: string;
  authzHeading: string;
  shapeIntro: string;
  shapeTable: string;
  actionHeading: string;
  actionTableHead: string;
  scopeHeading: string;
  scopeIntro: string;
  scopeTableHead: string;
  approvalHeading: string;
  approvalBody: string;
  privilegedHeading: string;
  privilegedBody: string;
  typesHeading: string;
  typesIntro: string;
  listHeading: string;
  listTableHead: string;
}

const REFERENCE: Record<Locale, ReferencePhrases> = {
  ja: {
    title: "権限とロール",
    description:
      "ログイン（認証）と、何ができるか（認可）のしくみ。権限の読み方・種類・一覧をまとめます。",
    intro:
      "「ログインできること」と「操作できること」は別々に決まっています。このページはその仕組みをまとめたものです。各アプリのマニュアルの末尾にも「必要な権限」を載せているので、目の前の画面のことを知りたいときはそちらが早いです。",
    authHeading: "## 認証と認可 — 2 つの段階",
    authBody:
      "システムは 2 つの段階を踏みます。\n\n1. **認証（にんしょう）** … あなたが誰なのかを確かめる段階です。いわゆるログインで、ここを通ると「誰として使っているか」が決まります。\n2. **認可（にんか）** … その人に何を許すかを決める段階です。ここで使うのが**権限**です。\n\nログインできたのに画面が開けないことがあるのは、この 2 つが別だからです。認証は通っている（あなたが誰かは分かっている）けれど、認可で足りていない（その操作は許されていない）という状態です。",
    authTable:
      "| どこから使うか | 本人確認のしかた | 手順 |\n| --- | --- | --- |\n| パソコン（Web） | 社内アカウントでのサインイン、またはユーザー名とパスワード | [はじめかた](start) |\n| 現場の共有タブレット | QRカードと PIN | [共有端末のはじめかた](operations/kiosk/start/user) |",
    authzHeading: "## 認可 — 権限は 3 つの組み合わせで決まります",
    shapeIntro:
      "「見積書を、自分の担当ぶんだけ、見られる」のように、3 つが揃って 1 つの権限になります。",
    shapeTable:
      "| | 意味 | 例 |\n| --- | --- | --- |\n| 権限 | 何についての権限か | 見積書 |\n| アクション | その中で何ができるか | 閲覧 / 作成 / 更新 |\n| 範囲 | どこまでが対象か | 全社 / 拠点 / 自分の担当 |",
    actionHeading: "### アクション",
    actionTableHead: "| アクション | 意味 |\n| --- | --- |",
    scopeHeading: "### 範囲（スコープ）",
    scopeIntro:
      "同じ「閲覧」でも、範囲によって見える件数が変わります。拠点で絞られている場合、自分が所属する拠点のデータだけが出ます。",
    scopeTableHead: "| 範囲 | 意味 |\n| --- | --- |",
    typesHeading: "## 権限の種類",
    typesIntro:
      "権限は性格ごとに 4 つに分かれます。どれを持っているかは「[自分の権限](/profile/permissions)」で確かめられます。",
    approvalHeading: "## 承認できるかどうかは、権限では決まりません",
    approvalBody:
      "書類を承認できる人は、権限ではなく**承認設定（MS0B）**で決まります。仕組みと設定のしかたは「[承認設定](operations/masters/approval-setting/user)」にまとまっているので、そちらを見てください。",
    privilegedHeading: "## 特権操作 — 権限だけでは行えないもの",
    privilegedBody:
      "端末の PIN を見る、QR カードを発行する、ログイン履歴の中身を開く——こうした操作は、権限を持っていても**そのままでは行えません**。特権アクセス（`SY0G`）で理由を書いて申請し、別の人の承認を受けた期間だけ行えます。\n\n持ち時間は承認された時点ではなく、**最初にその操作をした時点から**減りはじめます。詳しくは「[特権アクセス](operations/system/privileged-access/user)」を参照してください。",
    listHeading: "## 権限の一覧",
    listTableHead: "| 権限 | コード | できること |\n| --- | --- | --- |",
  },
  en: {
    title: "Permissions and roles",
    description:
      "How signing in (authentication) and what you may do (authorisation) fit together, how to read a permission, and the full list.",
    intro:
      "Being able to sign in and being able to act are decided separately. This page explains how. Each app's manual page ends with a *Permissions required* section, which is quicker if you only care about the screen in front of you.",
    authHeading: "## Authentication and authorisation — two stages",
    authBody:
      "The system works in two stages.\n\n1. **Authentication** — establishing who you are. This is signing in; afterwards the system knows which person is using it.\n2. **Authorisation** — deciding what that person may do. This is where permissions come in.\n\nSigning in successfully and still not being able to open a screen is the normal consequence of these being separate: authentication passed, authorisation did not.",
    authTable:
      "| Where you use it | How you are identified | Steps |\n| --- | --- | --- |\n| Desktop (web) | Company account sign-in, or username and password | [Getting started](start) |\n| Shop-floor tablet | QR card and PIN | [Getting started on the shared device](operations/kiosk/start/user) |",
    authzHeading: "## Authorisation — a permission is three things together",
    shapeIntro:
      'Like "view quotes, but only my own", three parts combine into one permission.',
    shapeTable:
      "| | Meaning | Example |\n| --- | --- | --- |\n| Permission | What it is about | Quote |\n| Action | What you may do | View / Create / Edit |\n| Scope | How far it reaches | Company-wide / Plant / Own records |",
    actionHeading: "### Actions",
    actionTableHead: "| Action | Meaning |\n| --- | --- |",
    scopeHeading: "### Scope",
    scopeIntro:
      "The same *View* shows different amounts depending on scope. Limited to a plant, you only see data for the plants you belong to.",
    scopeTableHead: "| Scope | Meaning |\n| --- | --- |",
    typesHeading: "## Kinds of permission",
    typesIntro:
      "Permissions fall into four kinds. To see which you hold, open [My permissions](/profile/permissions).",
    approvalHeading: "## Permissions do not decide who may approve",
    approvalBody:
      "Who may approve a document is decided by **承認設定 (MS0B)**, not by permissions. How it works and how to set it up is covered in [Approval settings](operations/masters/approval-setting/user).",
    privilegedHeading:
      "## Privileged operations — permission alone is not enough",
    privilegedBody:
      "Revealing a device PIN, issuing a QR card, opening the details of a login record: holding the permission **does not let you do these**. You request them in Privileged Access (`SY0G`) with a reason, and may act only for the window someone else approves.\n\nThe clock starts when you **first perform the operation**, not when it is approved. See [Privileged Access](operations/system/privileged-access/user).",
    listHeading: "## All permissions",
    listTableHead:
      "| Permission | Code | What it covers |\n| --- | --- | --- |",
  },
  zh: {
    title: "权限与角色",
    description:
      "登录（认证）与可做什么（授权）的机制，权限的读法、种类与一览。",
    intro:
      "「能否登录」与「能否操作」是分开决定的。本页说明其中的机制。各应用手册的末尾都有「所需权限」一节，若只想了解眼前的画面，看那里更快。",
    authHeading: "## 认证与授权 — 两个阶段",
    authBody:
      "系统分两个阶段。\n\n1. **认证** … 确认你是谁的阶段，也就是登录。通过之后，系统便知道是谁在使用。\n2. **授权** … 决定允许这个人做什么的阶段，这里用到的就是**权限**。\n\n已经登录却打不开画面，正是因为两者是分开的：认证通过了，但授权不足。",
    authTable:
      "| 从哪里使用 | 如何确认本人 | 步骤 |\n| --- | --- | --- |\n| 电脑（Web） | 公司账号登录，或用户名与密码 | [开始使用](start) |\n| 车间共享平板 | 二维码卡与 PIN | [共用终端入门](operations/kiosk/start/user) |",
    authzHeading: "## 授权 — 权限由三者组合而成",
    shapeIntro: "如「只能查看本人负责的报价单」，三个部分合起来构成一项权限。",
    shapeTable:
      "| | 含义 | 例 |\n| --- | --- | --- |\n| 权限 | 针对什么的权限 | 报价单 |\n| 动作 | 在其中可以做什么 | 查看 / 创建 / 更新 |\n| 范围 | 涉及到哪里 | 全公司 / 基地 / 本人负责的记录 |",
    actionHeading: "### 动作",
    actionTableHead: "| 动作 | 含义 |\n| --- | --- |",
    scopeHeading: "### 范围",
    scopeIntro:
      "同样是「查看」，范围不同可见的条数也不同。若限定为基地，则只显示本人所属基地的数据。",
    scopeTableHead: "| 范围 | 含义 |\n| --- | --- |",
    typesHeading: "## 权限的种类",
    typesIntro:
      "权限按性质分为四类。想确认自己持有哪些，请打开「[我的权限](/profile/permissions)」。",
    approvalHeading: "## 能否审批不由权限决定",
    approvalBody:
      "谁可以审批单据由**审批设置（MS0B）**决定，而非权限。其机制与设置方法请参见「[审批设置](operations/masters/approval-setting/user)」。",
    privilegedHeading: "## 特权操作 — 仅有权限还不够",
    privilegedBody:
      "查看终端 PIN、发放二维码卡、打开登录记录的明细——即使拥有权限也**不能直接执行**。需在特权访问（`SY0G`）中写明理由提出申请，并只在他人批准的时间段内执行。\n\n时间不是从批准时开始，而是从**第一次执行该操作时**开始减少。详见「[特权访问](operations/system/privileged-access/user)」。",
    listHeading: "## 权限一览",
    listTableHead: "| 权限 | 代码 | 可以做什么 |\n| --- | --- | --- |",
  },
};

/** 参照ページ 1 枚ぶんの Markdown（frontmatter を含む）。 */
export function buildPermissionsReferencePage(locale: Locale): string {
  const t = REFERENCE[locale];
  const out: string[] = [
    "---",
    `title: "${t.title}"`,
    `description: "${t.description}"`,
    "---",
    t.intro,
    "",
    t.authHeading,
    "",
    t.authBody,
    "",
    t.authTable,
    "",
    t.authzHeading,
    "",
    t.shapeIntro,
    "",
    t.shapeTable,
    "",
    t.actionHeading,
    "",
    t.actionTableHead,
  ];
  for (const action of ["READ", "CREATE", "UPDATE", "DELETE", "EXPORT"]) {
    out.push(
      `| ${actionLabel(action, locale)} | ${ACTION_MEANING[locale][action]} |`,
    );
  }
  out.push("", t.scopeHeading, "", t.scopeIntro, "", t.scopeTableHead);
  for (const scope of DOCUMENTED_SCOPES) {
    out.push(
      `| ${scopeLabel(scope, locale)} | ${SCOPE_MEANING[locale][scope]} |`,
    );
  }
  out.push("", t.approvalHeading, "", t.approvalBody);
  out.push("", t.privilegedHeading, "", t.privilegedBody);

  // 権限の「種類」— 一覧の前に、それぞれがどういう性格の集まりなのかを説明する。
  // 表にすると 1 行が長くなりすぎるので、段落で並べる。
  out.push("", t.typesHeading, "", t.typesIntro, "");
  for (const group of PERMISSION_GROUP_ORDER) {
    out.push(
      `**${PERMISSION_GROUP_LABEL[group][locale]}** — ${PERMISSION_GROUP_SUMMARY[group][locale]}`,
      "",
    );
  }

  out.push(t.listHeading, "");
  for (const group of PERMISSION_GROUP_ORDER) {
    const items = permissionsByGroup(group);
    if (items.length === 0) continue;
    out.push(
      `### ${PERMISSION_GROUP_LABEL[group][locale]}`,
      "",
      t.listTableHead,
    );
    for (const p of items) {
      out.push(`| ${p.label[locale]} | \`${p.code}\` | ${p.summary[locale]} |`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

const ACTION_MEANING: Record<Locale, Record<string, string>> = {
  ja: {
    READ: "一覧や詳細を見る",
    CREATE: "新しく作る",
    UPDATE: "内容を変える",
    DELETE: "消す",
    EXPORT: "CSV などに書き出す",
  },
  en: {
    READ: "See lists and details",
    CREATE: "Create new records",
    UPDATE: "Change existing ones",
    DELETE: "Remove them",
    EXPORT: "Export to CSV and similar",
  },
  zh: {
    READ: "查看列表与明细",
    CREATE: "新建记录",
    UPDATE: "修改内容",
    DELETE: "删除",
    EXPORT: "导出为 CSV 等",
  },
};

const SCOPE_MEANING: Record<Locale, Record<string, string>> = {
  ja: {
    ALL: "会社全体。拠点による絞り込みはありません",
    REGION: "自分の所属拠点がある地域の、すべての拠点",
    PLANT: "自分が所属している拠点だけ",
    OWN: "自分が作った / 自分が担当のものだけ",
  },
  en: {
    ALL: "The whole company — no plant filter",
    REGION: "Every plant in the regions your plants belong to",
    PLANT: "Only the plants you belong to",
    OWN: "Only records you created or are responsible for",
  },
  zh: {
    ALL: "全公司，不按基地过滤",
    REGION: "本人所属基地所在地区的全部基地",
    PLANT: "仅本人所属的基地",
    OWN: "仅本人创建或负责的记录",
  },
};
