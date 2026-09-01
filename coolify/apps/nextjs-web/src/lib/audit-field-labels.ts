/**
 * audit-field-labels.ts — 履歴に出す**列名 → 日本語ラベル**と、値の読める形。
 *
 * 監査ログは before/after の JSON をそのまま持っている。生のまま出すと
 * `{"scalePercent":125,"contentType":"IMAGE"}` のような塊になり、**何が変わったのかを
 * 読む人が JSON を解読する作業**になる。列名も DB の名前（`assignedPlantId`）で、
 * 画面に出ている言葉（「担当拠点」）と一致しない。
 *
 * ここは純粋な対応表と整形だけ。DB にも React にも触らないので、サーバー側の
 * 要約（lib/audit.ts）とクライアント側の差分表（AuditChangeTable）の**両方が
 * 同じ表を使う**。片方だけ直ると、一覧と詳細で違う言葉が出る。
 *
 * ★ 載っていない列は**キーをそのまま出す**（推測して間違った名前を出さない）。
 *   よく見るのに読めない列を見つけたら、ここに 1 行足すこと。
 */

/**
 * 表をまたいで同じ意味の列。**名前が同じで意味が違う列は下の TABLE_FIELD_LABELS
 * で上書きする**（例: kiosk_devices.name は「端末名」）。
 */
const FIELD_LABELS: Record<string, string> = {
  // 共通
  id: "ID",
  status: "ステータス",
  isActive: "有効",
  isEnabled: "有効",
  notes: "備考",
  note: "メモ",
  name: "名称",
  nameJa: "名称",
  nameEn: "名称（英）",
  code: "コード",
  description: "説明",
  sortOrder: "表示順",
  createdAt: "作成日時",
  updatedAt: "更新日時",
  createdBy: "作成者",
  updatedBy: "更新者",
  // 取引先・拠点・人
  customerBpId: "顧客",
  supplierBpId: "仕入先",
  shipToBpId: "出荷先",
  endUserBpId: "最終需要家",
  plantId: "拠点",
  assignedPlantId: "担当拠点",
  fromPlantId: "出荷元拠点",
  salesRepId: "営業担当",
  assigneeId: "担当者",
  userId: "ユーザー",
  // 金額・数量
  quantity: "数量",
  plannedQuantity: "予定数量",
  unitPrice: "単価",
  baseUnitPrice: "基準単価",
  amount: "金額",
  totalAmount: "合計金額",
  subtotal: "小計",
  taxAmount: "消費税",
  discountAmount: "値引き額",
  currency: "通貨",
  unit: "単位",
  // 日付
  validFrom: "有効開始日",
  validUntil: "有効終了日",
  deliveryDate: "納期",
  desiredAt: "希望納期",
  shippedAt: "出荷日",
  deliveredAt: "納品日",
  receivedAt: "入荷日",
  orderedAt: "発注日",
  approvedAt: "承認日時",
  requestedAt: "依頼日時",
  completedAt: "完了日時",
  startedAt: "開始日時",
  cancelledAt: "キャンセル日時",
  // 製品・素材
  productId: "製品",
  materialId: "素材",
  materialTypeId: "材種",
  diameterMm: "直径",
  lengthMm: "全長",
  // 生産
  workOrderId: "指示書",
  orderLineId: "注文明細",
  lotNumber: "ロット番号",
  processStepId: "工程",
  executionLocation: "実施場所",
  inputQuantity: "受入数",
  outputSuccessQuantity: "良品数",
  // 権限・承認
  roleId: "ロール",
  permissionCode: "権限コード",
  action: "操作",
  scope: "範囲",
  approvalStatus: "承認状態",
  reason: "理由",
  // ファイル
  fileId: "ファイル",
  fileName: "ファイル名",
  storageKey: "保存キー",
  mimeType: "種別",
};

/**
 * 表ごとの上書き。**同じ列名でも意味が違うとき**だけ書く
 * （全部書くと、共通の表を持つ意味が無くなる）。
 */
const TABLE_FIELD_LABELS: Record<string, Record<string, string>> = {
  kiosk_devices: {
    name: "端末名",
    location: "設置場所",
    defaultWorkLocationId: "既定の作業場所",
  },
  display_devices: {
    name: "ディスプレイ名",
    // 入れ子（contentConfig の中身）は**ドット付きの道**でも引ける。
    // 下の auditFieldLabel が「全体の道 → 最後の 1 つ」の順に見る。
    "contentConfig.page": "映す画面",
    "contentConfig.fit": "画像の収め方",
    "contentConfig.fileId": "画像ファイル",
    "contentConfig.url": "URL",
    "contentConfig.dashboardId": "ダッシュボード",
    location: "設置場所",
    contentType: "表示内容の種別",
    contentConfig: "表示内容の設定",
    refreshIntervalSec: "更新間隔（秒）",
    scalePercent: "表示倍率（%）",
    machineId: "つないでいる機械",
    screenIndex: "画面番号",
    image: "画像",
    fit: "画像の収め方",
  },
  users: { name: "氏名", isActive: "在籍" },
};

/**
 * 値の読み替え。**enum を生で出さない**（`APP_PAGE` は画面のどこにも出ていない
 * 言葉なので、履歴で初めて見ることになる）。キーは列名（入れ子は最後の 1 つ）。
 */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  contentType: {
    APP_PAGE: "アプリの画面",
    METABASE: "集計ダッシュボード",
    URL: "外部ページ",
    IMAGE: "画像",
  },
  fit: {
    contain: "全体を表示",
    cover: "画面を埋める",
    fill: "引き伸ばす",
  },
  page: {
    production: "生産状況",
    pending: "未処理・手配待ち",
    shipping: "出荷予定",
    quality: "品質・不良",
    announcement: "お知らせ",
  },
};

/** 列名 → 表示ラベル。**未登録はキーをそのまま**返す。 */
export function auditFieldLabel(key: string, tableName?: string): string {
  // 入れ子は「contentConfig.fit」のようなドット付きの道で来る。
  // 道そのもの → 最後の 1 つ、の順に探す。
  const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;
  if (tableName) {
    const table = TABLE_FIELD_LABELS[tableName];
    const override = table?.[key] ?? table?.[leaf];
    if (override) return override;
  }
  return FIELD_LABELS[key] ?? FIELD_LABELS[leaf] ?? leaf;
}

/**
 * 入れ子のオブジェクトを**葉だけの平らな対応表**にする。
 *
 * `{ contentConfig: { fit: "cover" } }` → `{ "contentConfig.fit": "cover" }`。
 * こうしておくと、差分が「設定オブジェクトが変わった」ではなく
 * 「画像の収め方が変わった」という粒度で出せる。
 *
 * 配列と多言語 JSON はそれ以上ほどかない（1 つの値として読めるため）。
 */
export function flattenAuditValue(
  value: unknown,
  prefix = "",
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    typeof (value as Record<string, unknown>).ja === "string"
  ) {
    return prefix ? { [prefix]: value } : {};
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flattenAuditValue(child, path));
  }
  // 中身が空のオブジェクトは、そのままの値として置く（消してしまわない）
  if (Object.keys(out).length === 0 && prefix) return { [prefix]: value };
  return out;
}

/** ISO 8601 らしい文字列か（日付だけ整形したいので緩く見る）。 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2})?/;

/**
 * 値を読める文字にする。
 *
 * **推測して整形しすぎない** — 分からない形は JSON のまま出すほうが、
 * 間違った要約を出すより安全（生データの折りたたみと突き合わせられる）。
 */
export function formatAuditValue(value: unknown, key?: string): string {
  if (key !== undefined && typeof value === "string") {
    const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;
    const mapped = VALUE_LABELS[leaf]?.[value];
    if (mapped) return mapped;
  }
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "はい" : "いいえ";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // 日付らしければ読みやすく（秒・タイムゾーンは落とす）
    if (ISO_DATE.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        const p = (n: number) => String(n).padStart(2, "0");
        const ymd = `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
        return value.length <= 10
          ? ymd
          : `${ymd} ${p(d.getHours())}:${p(d.getMinutes())}`;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? "（なし）"
      : value.map((v) => formatAuditValue(v)).join(", ");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // 多言語 JSON（{ ja, en, … }）は既定言語だけ出す
    if (typeof o.ja === "string") return o.ja;
    return JSON.stringify(value);
  }
  return String(value);
}

export interface AuditFieldDiff {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
}

/**
 * before/after を突き合わせて、**変わった列だけ**返す。
 *
 * 比較は整形後の文字列で行う（`1` と `"1"`、日付の表記ゆれを差分にしない）。
 */
export function auditFieldDiffs(
  before: unknown,
  after: unknown,
  tableName?: string,
): AuditFieldDiff[] {
  if (before !== null && typeof before === "object" && Array.isArray(before)) {
    return [];
  }
  // **平らにしてから比べる。** そうしないと「表示内容の設定」が丸ごと 1 行に
  // なり、JSON 同士を目で突き合わせる作業になる（実際そうなっていた）。
  const b = flattenAuditValue(before ?? {});
  const a = flattenAuditValue(after ?? {});
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  const diffs: AuditFieldDiff[] = [];
  for (const key of keys) {
    if (formatAuditValue(b[key], key) === formatAuditValue(a[key], key)) {
      continue;
    }
    diffs.push({
      key,
      label: auditFieldLabel(key, tableName),
      before: b[key],
      after: a[key],
    });
  }
  return diffs;
}
