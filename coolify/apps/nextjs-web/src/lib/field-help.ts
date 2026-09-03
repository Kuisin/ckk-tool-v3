/**
 * field-help.ts — 入力欄の「?」に出す要約と、マニュアルの該当箇所。
 *
 * 画面の入力欄からマニュアルへ迷わず辿れるように、**要約とリンク先をここ 1 箇所**に
 * まとめる。呼び出し側は展開するだけ:
 *
 *   <DatePickerInput label={<HelpLabel {...fieldHelp(tr, "quote", "deliveryDate")} />} … />
 *
 * リンク先はアプリ key（= マニュアルのフォルダ名）とフィールド名から組み立てる:
 *   operations/<カテゴリ>/<アプリ>/user#field-<ケバブ化したフィールド名>
 * マニュアル側は `### 納期 [#field-delivery-date]` のように **明示 ID** を書くこと
 * （自動生成 ID は見出し文言に依存して壊れやすい）。
 *
 * **文言は `messages/*.json` の `fieldHelp.<app>.<field>.{label,summary}`**
 * に持つ（next-intl 経由で 3 言語に対応するため）。この `FIELD_HELP` オブジェクト
 * 自体は文言を持たない — **アプリ → フィールドキーの列挙**（型チェックと
 * `anchor` 上書きのためだけ）に用途を絞ってある。文言を直すときは
 * `messages/ja.json` の対応するキーを直す（+ en/zh も追従させる）。
 *
 * ID が実在するかは field-help.test.ts が実ファイルを読んで検証する — 見出しを
 * 消す・改名すると落ちるので、リンク切れが放置されない。
 */

import type { Tr } from "./i18n";

/** マニュアル上のアプリ位置（operations/<カテゴリ>/<アプリ>）。 */
const APP_MANUAL_PATH = {
  quote: "operations/sales/quote/user",
  priceList: "operations/sales/price-list/user",
  orderAcceptance: "operations/sales/order-acceptance/user",
  designRequest: "operations/sales/design-request/user",
  trialEstimate: "operations/sales/trial-estimate/user",
  purchaseRequest: "operations/purchasing/purchase-request/user",
  purchaseOrder: "operations/purchasing/purchase-order/user",
  materialReceipt: "operations/purchasing/material-receipt/user",
  workOrder: "operations/production/work-order/user",
  productInventory: "operations/production/product-inventory/user",
  materialInventory: "operations/production/material-inventory/user",
  approval: "operations/general/my-tasks/user",
  deliveryOrder: "operations/shipping/delivery-order/user",
  deliveryNote: "operations/shipping/delivery-note/user",
  businessPartner: "operations/masters/business-partner/user",
  product: "operations/masters/product/user",
  materialType: "operations/masters/material-type/user",
  material: "operations/masters/material/user",
  processStep: "operations/masters/process-step/user",
  inspectionTemplate: "operations/masters/inspection-template/user",
  defectType: "operations/masters/defect-type/user",
  approvalGroup: "operations/masters/approval-setting/user",
  approvalFlow: "operations/masters/approval-setting/user",
  plant: "operations/masters/plant/user",
  materialNumbering: "operations/masters/material-numbering/user",
  workLocation: "operations/masters/work-location/user",
  storageLocation: "operations/masters/storage-location/user",
  userManagement: "operations/system/user-management/user",
  fileManagement: "operations/system/file-management/user",
  kioskCard: "operations/system/kiosk-card/user",
  kioskDevice: "operations/system/kiosk-device/user",
  productType: "operations/system/product-type/settings",
} as const satisfies Record<string, string>;

export type HelpApp = keyof typeof APP_MANUAL_PATH;

interface FieldHelpEntry {
  /** 既定（field-<kebab>）と違う ID を使う場合のみ指定。 */
  anchor?: string;
}

/**
 * アプリ → フィールドキーの列挙。マニュアルの `## 入力項目` と 1 対 1 で対応する
 * （文言そのものは `messages/*.json` の `fieldHelp.<app>.<field>` にある）。
 */
export const FIELD_HELP = {
  quote: {
    customer: {},
    customerBranch: {},
    validUntil: {},
    status: {},
    product: {},
    orderType: {},
    quantity: {},
    deliveryDate: {},
    notes: {},
  },
  priceList: {
    customer: {},
    product: {},
    orderType: {},
    basePrice: {},
    validFrom: {},
    validUntil: {},
    multiplier: {},
    customPrice: {},
  },
  orderAcceptance: {
    customer: {},
    customerOrderRef: {},
    quoteNumber: {},
    orderDate: {},
    shipTo: {},
    deliveryMethod: {},
    endUser: {},
    assignedPlant: {},
    shippingWorkLocation: {},
    notes: {},
    product: {},
    orderType: {},
    quantity: {},
    unitPrice: {},
    deliveryDate: {},
    itemNotes: {},
  },
  designRequest: {
    trigger: {},
    quote: {},
    orderLine: {},
    product: {},
    assignee: {},
    desiredAt: {},
    priority: {},
    baseDesignFile: {},
    changeReason: {},
    description: {},
  },
  trialEstimate: {
    customer: {},
    product: {},
    maxDiameter: {},
    length: {},
    materialType: {},
    diameter: {},
    surfaceFinish: {},
    cylinderType: {},
    stepMachining: {},
    neckMachining: {},
    machiningTime: {},
    coating: {},
    lapping: {},
    inspectionReport: {},
    ld: {},
  },
  purchaseRequest: {
    reason: {},
    notes: {},
    material: {},
    plant: {},
    quantity: {},
    unit: {},
    desiredDate: {},
    itemNotes: {},
  },
  purchaseOrder: {
    supplier: {},
    orderDate: {},
    notes: {},
    material: {},
    plant: {},
    quantity: {},
    unit: {},
    unitPrice: {},
    expectedDate: {},
    itemNotes: {},
  },
  materialReceipt: {
    material: {},
    supplier: {},
    plant: {},
    receivedDate: {},
    quantity: {},
    unit: {},
    notes: {},
  },
  workOrder: {
    orderLine: {},
    allocQuantity: {},
    product: {},
    plannedQuantity: {},
    material: {},
    storageLocation: {},
    route: {},
    newRouteName: {},
    inspectionTemplates: {},
    notes: {},
  },
  productInventory: {
    plant: {},
    location: {},
    quantity: {},
    notes: {},
  },
  materialInventory: {
    plant: {},
    location: {},
    quantity: {},
    notes: {},
  },
  approval: {
    rejectReason: {},
  },
  deliveryOrder: {
    orderLine: { anchor: "field-order-line" },
    type: {},
    plant: {},
    notes: {},
    product: {},
    quantity: {},
  },
  deliveryNote: {
    deliveryOrder: {},
    deliveryMethod: {},
    recipient: {},
    endUser: {},
    includePrice: {},
    notes: {},
    product: {},
    quantity: {},
    unitPrice: {},
  },
  businessPartner: {
    bpCode: {},
    name: {},
    nameKana: {},
    country: {},
    taxNumber: {},
    matchNames: {},
    address: {},
    contact: {},
    active: {},
    notes: {},
    billingBp: {},
    paymentTerms: {},
    creditLimit: {},
    taxType: {},
    invoiceMethod: {},
    consignment: {},
    vendorType: {},
    leadTime: {},
    vendorPayment: {},
    bank: {},
    industry: {},
  },
  product: {
    code: {},
    name: {},
    unit: {},
    productType: {},
    materialType: {},
    dimensions: {},
    keywords: {},
    active: {},
    notes: {},
  },
  materialType: {
    manufacturer: {},
    grade: {},
    shape: {},
    name: {},
    active: {},
  },
  material: {
    materialType: {},
    surfaceFinish: {},
    dimensions: {},
    kind: {},
    code: {},
    name: {},
    unit: {},
    model: {},
    keywords: {},
    active: {},
    notes: {},
  },
  processStep: {
    code: {},
    allowedLocations: {},
    category: {},
    execution: {},
    quantityTracking: {},
    defaultTime: {},
    sync: {},
    inspection: {},
    approvalRank: {},
    sortOrder: {},
    active: {},
  },
  inspectionTemplate: {
    code: {},
    processStep: {},
    active: {},
  },
  defectType: {
    code: {},
    sortOrder: {},
    active: {},
  },
  approvalGroup: {
    name: {},
    active: {},
    validFrom: {},
    validUntil: {},
  },
  approvalFlow: {
    stepName: {},
    group: {},
    mode: {},
  },
  plant: {
    code: {},
    name: {},
    region: {},
    address: {},
    contact: {},
    active: {},
    notes: {},
  },
  materialNumbering: {
    code: {},
    name: {},
    active: {},
  },
  workLocation: {
    plant: {},
    code: {},
    type: {},
    capacity: {},
    sortOrder: {},
  },
  storageLocation: {
    plant: {},
    code: {},
    sortOrder: {},
    active: {},
  },
  userManagement: {
    roles: {},
    plants: {},
  },
  fileManagement: {
    showSystemFiles: {},
    grantFolder: {},
    grantUser: {},
    grantWrite: {},
  },
  kioskCard: {
    count: {},
    user: {},
  },
  kioskDevice: {
    name: {},
    plant: {},
    location: {},
    defaultWorkLocation: {},
    linkCode: {},
  },
  productType: {
    itemName: {},
    key: {},
    type: {},
    default: {},
    placeholder: {},
    required: {},
    pattern: {},
    range: {},
    typeName: {},
    typeDescription: {},
    typeActive: {},
    typeItems: {},
    typeDefault: {},
  },
} as const satisfies Record<HelpApp, Record<string, FieldHelpEntry>>;

/** キャメルケース → ケバブケース（deliveryDate → delivery-date）。 */
export function toAnchorId(field: string): string {
  return `field-${field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

/** マニュアルの該当箇所（HelpLabel の `manual` に渡す形）。 */
export function fieldManualTarget<A extends HelpApp>(
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
): string {
  const entry = FIELD_HELP[app][field] as FieldHelpEntry;
  return `${APP_MANUAL_PATH[app]}#${entry.anchor ?? toAnchorId(field)}`;
}

/**
 * HelpLabel にそのまま展開できる props。呼び出し側の `tr` を渡す。
 *   <HelpLabel {...fieldHelp(tr, "quote", "deliveryDate")} />
 *
 * マニュアルが複数の欄を 1 見出しにまとめている場合（例 `名称 / よみがな`）は、
 * `label` で画面側の文言に上書きする — 説明とリンク先は同じ見出しを指したまま、
 * ラベルだけ画面の言葉に合わせる:
 *   fieldHelp(tr, "plant", "name", { label: "よみがな" })
 */
export function fieldHelp<A extends HelpApp>(
  tr: Tr,
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
  options?: { required?: boolean; label?: string },
): { label: string; help: string; manual: string; required?: boolean } {
  // app/field はジェネリックなので、next-intl の厳密なキー型検査が効かせられない
  // （テンプレートリテラル型が推論不能になる）。ここだけ string 呼び出しへ倒す。
  const t = tr as unknown as (key: string) => string;
  return {
    label: options?.label ?? t(`fieldHelp.${app}.${field}.label`),
    help: t(`fieldHelp.${app}.${field}.summary`),
    manual: fieldManualTarget(app, field),
    ...(options?.required ? { required: true } : {}),
  };
}

/**
 * ラベルを自前で組み立てるコンポーネント（LocalizedTextInput の
 * 「〜（日本語）」など）へ渡す、説明とリンク先だけの組。呼び出し側の `tr` を渡す。
 *   <LocalizedTextInput label="名称" help={fieldHelpTip(tr, "plant", "name")} … />
 */
export function fieldHelpTip<A extends HelpApp>(
  tr: Tr,
  app: A,
  field: Extract<keyof (typeof FIELD_HELP)[A], string>,
): { help: string; manual: string } {
  const t = tr as unknown as (key: string) => string;
  return {
    help: t(`fieldHelp.${app}.${field}.summary`),
    manual: fieldManualTarget(app, field),
  };
}

/** テスト用: 登録済みの (アプリ, フィールド, アンカー, マニュアルパス) を列挙する。 */
export function listFieldHelp(): {
  app: string;
  field: string;
  anchor: string;
  manualPage: string;
}[] {
  return Object.entries(FIELD_HELP).flatMap(([app, fields]) =>
    Object.entries(fields).map(([field, entry]) => ({
      app,
      field,
      anchor: (entry as FieldHelpEntry).anchor ?? toAnchorId(field),
      manualPage: APP_MANUAL_PATH[app as HelpApp],
    })),
  );
}
