/**
 * webhook-core.ts — 外向き Webhook の規則（純粋・試験あり）。
 *
 * 設計の全体は `_specs/api.md` §9。ここは**判断が要る規則の唯一の定義元**:
 *   - どの監査行がどのイベントになるか（`WEBHOOK_RESOURCES` / `eventTypesForAudit`）
 *   - 本文の形（`buildEventPayload`）— 合図であって中身ではない
 *   - 署名（Standard Webhooks 互換 / HMAC-SHA256）
 *   - 送信先 URL の検証（SSRF の入口）
 *   - 再試行の間隔
 *
 * DB も fetch も持たない。ディスパッチャ（`webhook-dispatcher.ts`）と管理画面
 * （`webhooks-admin.ts`）と OpenAPI / マニュアル生成がここを読む。**マニュアルの
 * イベント一覧はこの登録簿から生成される**（`tools/api-docs`）ので、イベントを
 * 足すときは `WEBHOOK_RESOURCES` を直すだけでよい。
 *
 * ■ 英語で固定（`// i18n-ignore`）
 * 説明文は OpenAPI 文書・マニュアルの機械向け部分に出る。`api-resources.ts` と
 * 同じ扱いで、閲覧者によって変わってはいけないので翻訳しない。
 */

import { createHash, createHmac, randomBytes } from "node:crypto";

// ── 資源の登録簿 ─────────────────────────────────────────────────────────

export interface WebhookResource {
  /** audit_logs.table_name。 */
  table: string;
  /** イベント種別の接頭辞（`order_acceptance.created`）。公開契約 — 改名しない。 */
  resource: string;
  /** その資源を読むのに要る権限コード（`api-resources.ts` と同じ）。 */
  permission: string;
  /** 受け取った側が引き直す `/api/v1` の口。 */
  apiPath: string;
  /** 英語の説明（OpenAPI / マニュアル用）。 */
  summary: string;
  /** `.status_changed` を出すか（status 列を持つ資源だけ）。 */
  hasStatus: boolean;
}

export const WEBHOOK_RESOURCES: readonly WebhookResource[] = [
  {
    table: "order_acceptances",
    resource: "order_acceptance",
    permission: "order_acceptance",
    apiPath: "/order-acceptances",
    summary: "Order acceptance (注文請書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "order_lines",
    resource: "order_line",
    permission: "order_acceptance",
    apiPath: "/order-lines",
    summary: "Order line (注文明細).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "work_orders",
    resource: "work_order",
    permission: "work_order",
    apiPath: "/work-orders",
    summary: "Work order (指示書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "quotes",
    resource: "quote",
    permission: "quote",
    apiPath: "/quotes",
    summary: "Quote (見積書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "delivery_orders",
    resource: "delivery_order",
    permission: "delivery_order",
    apiPath: "/delivery-orders",
    summary: "Delivery order (出荷書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "delivery_notes",
    resource: "delivery_note",
    permission: "delivery_note",
    apiPath: "/delivery-notes",
    summary: "Delivery note (納品書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "invoices",
    resource: "invoice",
    permission: "invoice",
    apiPath: "/invoices",
    summary: "Invoice (請求書).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "billing_closings",
    resource: "billing_closing",
    permission: "billing_closing",
    apiPath: "/billing-closings",
    summary: "Billing closing (締日処理).", // i18n-ignore
    hasStatus: true,
  },
  {
    table: "business_partners",
    resource: "business_partner",
    permission: "master",
    apiPath: "/business-partners",
    summary: "Business partner (取引先).", // i18n-ignore
    hasStatus: false,
  },
  {
    table: "products",
    resource: "product",
    permission: "master",
    apiPath: "/products",
    summary: "Product (製品).", // i18n-ignore
    hasStatus: false,
  },
  {
    table: "materials",
    resource: "material",
    permission: "master",
    apiPath: "/materials",
    summary: "Material (素材).", // i18n-ignore
    hasStatus: false,
  },
  {
    table: "material_types",
    resource: "material_type",
    permission: "master",
    apiPath: "/material-types",
    summary: "Material type (材種).", // i18n-ignore
    hasStatus: false,
  },
  {
    table: "plants",
    resource: "plant",
    permission: "master",
    apiPath: "/plants",
    summary: "Site (拠点).", // i18n-ignore
    hasStatus: false,
  },
  {
    table: "storage_locations",
    resource: "storage_location",
    permission: "master",
    apiPath: "/storage-locations",
    summary: "Storage location (保管場所).", // i18n-ignore
    hasStatus: false,
  },
] as const;

const BY_TABLE = new Map(WEBHOOK_RESOURCES.map((r) => [r.table, r]));
const BY_RESOURCE = new Map(WEBHOOK_RESOURCES.map((r) => [r.resource, r]));

export type WebhookAction = "created" | "updated" | "deleted";

/** 疎通確認用。購読に関係なく、テスト送信でだけ出る。 */
export const PING_EVENT_TYPE = "webhook.ping";

export interface WebhookEventTypeInfo {
  type: string;
  resource: WebhookResource;
  /** 発火条件（英語）。 */
  when: string;
}

/** 購読できるイベント種別の全一覧（マニュアル・OpenAPI・画面のチェック欄の元）。 */
export function listWebhookEventTypes(): WebhookEventTypeInfo[] {
  const out: WebhookEventTypeInfo[] = [];
  for (const r of WEBHOOK_RESOURCES) {
    out.push({
      type: `${r.resource}.created`,
      resource: r,
      when: "A row was created.", // i18n-ignore
    });
    out.push({
      type: `${r.resource}.updated`,
      resource: r,
      when: "A row was changed (any field).", // i18n-ignore
    });
    if (r.hasStatus) {
      out.push({
        type: `${r.resource}.status_changed`,
        resource: r,
        when: "The status field changed. Fired in addition to `.updated`.", // i18n-ignore
      });
    }
    out.push({
      type: `${r.resource}.deleted`,
      resource: r,
      when: "A row was deleted. Most documents are never deleted — see `/deletions`.", // i18n-ignore
    });
  }
  return out;
}

const KNOWN_TYPES = new Set(listWebhookEventTypes().map((t) => t.type));

export function isKnownEventType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}

export function resourceOfEventType(type: string): WebhookResource | null {
  const dot = type.lastIndexOf(".");
  if (dot < 0) return null;
  return BY_RESOURCE.get(type.slice(0, dot)) ?? null;
}

/**
 * 購読の検証。**空配列は拒否する**（schema の既定が「何も送らない」なので、
 * 画面が空のまま保存できると「作ったのに何も来ない」を作る）。
 * `*` は単独でのみ有効（他と混ぜない）。
 */
export function normalizeEventTypes(
  input: readonly string[],
): { ok: true; types: string[] } | { ok: false; error: string } {
  const types = [...new Set(input.map((s) => s.trim()).filter(Boolean))];
  if (types.length === 0) {
    return { ok: false, error: "eventTypes must not be empty" };
  }
  if (types.includes("*")) {
    return types.length === 1
      ? { ok: true, types: ["*"] }
      : { ok: false, error: "'*' cannot be combined with other event types" };
  }
  const unknown = types.find((t) => !isKnownEventType(t));
  if (unknown) return { ok: false, error: `unknown event type: ${unknown}` };
  return { ok: true, types: types.sort() };
}

/** 購読に当たるか。`*` は全種別（ping を除く — ping はテスト送信が直に作る）。 */
export function subscribes(
  subscribed: readonly string[],
  type: string,
): boolean {
  return subscribed.includes("*") || subscribed.includes(type);
}

// ── 監査行 → イベント ────────────────────────────────────────────────────

export interface AuditRowLike {
  id: bigint | number;
  action: string;
  tableName: string;
  recordId: string | null;
  recordKey: string | null;
  beforeData: unknown;
  afterData: unknown;
  createdAt: Date;
}

const ACTION_MAP: Record<string, WebhookAction | undefined> = {
  CREATE: "created",
  UPDATE: "updated",
  DELETE: "deleted",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** 比較から外す列（毎回動くので「変更」の情報にならない）。 */
const NOISE_FIELDS = new Set(["updatedAt", "updated_at"]);

/** 変わった項目の**名前**（値は返さない — 合図であって中身ではない）。 */
export function changedFieldNames(before: unknown, after: unknown): string[] {
  const b = asRecord(before);
  const a = asRecord(after);
  if (!b || !a) return [];
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: string[] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.push(k);
  }
  return out.sort().slice(0, 50);
}

function statusOf(v: unknown): string | null {
  const r = asRecord(v);
  const s = r?.status;
  return typeof s === "string" ? s : null;
}

/**
 * 1 つの監査行が出すイベント種別（0〜2 個）。
 * 登録簿に無い表・VIEW / EXPORT / SEED / MIGRATE は何も出さない。
 * UPDATE で status が変わったときだけ `.status_changed` を**追加で**出す。
 */
export function eventTypesForAudit(row: AuditRowLike): string[] {
  const res = BY_TABLE.get(row.tableName);
  const action = ACTION_MAP[row.action];
  if (!res || !action) return [];
  const types = [`${res.resource}.${action}`];
  if (action === "updated" && res.hasStatus) {
    const from = statusOf(row.beforeData);
    const to = statusOf(row.afterData);
    if (from !== null && to !== null && from !== to) {
      types.push(`${res.resource}.status_changed`);
    }
  }
  return types;
}

export function resourceForTable(table: string): WebhookResource | null {
  return BY_TABLE.get(table) ?? null;
}

export interface WebhookEventPayload {
  /** 受け取り側の重複排除に使う。再送でも同じ値。 */
  id: string;
  type: string;
  apiVersion: "v1";
  occurredAt: string;
  resource: {
    type: string;
    /** 書類番号（`ORD-202609-00042`）またはマスタの id。画面・API と同じ公開識別子。 */
    id: string | null;
    /** 安定キー（複合キーは `YYYYMM:seq`）。採番がリセットされても別の行を指さない。 */
    key: string | null;
  };
  /** status が変わったとき（`.status_changed`）だけ。値は enum のまま。 */
  status?: { from: string; to: string };
  /** 変わった項目の名前。値は載せない。 */
  changedFields?: string[];
  /** 本体を引き直す口。`?updatedSince=` にこの時刻を渡す。 */
  links: { list: string };
}

/**
 * 本文を組み立てる。**金額・住所などの値は載せない**（`_specs/api.md` §9.2）。
 * 受け取った側が `/api/v1` を引き直す — 認可と行スコープがそこに 1 か所だけ残る。
 */
export function buildEventPayload(
  row: AuditRowLike,
  type: string,
): WebhookEventPayload | null {
  const res = resourceOfEventType(type);
  if (!res || res.table !== row.tableName) return null;

  const occurredAt = row.createdAt.toISOString();
  const payload: WebhookEventPayload = {
    id: `evt_${row.id}_${type}`,
    type,
    apiVersion: "v1",
    occurredAt,
    resource: { type: res.resource, id: row.recordId, key: row.recordKey },
    links: {
      // 1 秒戻す: updatedSince は包含境界で、時計の丸めで取りこぼさないため。
      list: `/api/v1${res.apiPath}?updatedSince=${encodeURIComponent(
        new Date(row.createdAt.getTime() - 1_000).toISOString(),
      )}`,
    },
  };
  if (type.endsWith(".status_changed")) {
    const from = statusOf(row.beforeData);
    const to = statusOf(row.afterData);
    if (from !== null && to !== null) payload.status = { from, to };
  } else if (type.endsWith(".updated")) {
    const fields = changedFieldNames(row.beforeData, row.afterData);
    if (fields.length > 0) payload.changedFields = fields;
  }
  return payload;
}

export function buildPingPayload(
  deliveryId: string,
  now: Date,
): WebhookEventPayload {
  return {
    id: `evt_ping_${deliveryId}`,
    type: PING_EVENT_TYPE,
    apiVersion: "v1",
    occurredAt: now.toISOString(),
    resource: { type: "webhook", id: null, key: null },
    links: { list: "/api/v1/me" },
  };
}

// ── 署名（Standard Webhooks 互換）────────────────────────────────────────
//
// https://www.standardwebhooks.com/ — 3 ヘッダ + `whsec_<base64>` の鍵。
// 各言語に検証ライブラリがあるので、受け取り側が自前で書かなくて済む。
// 署名対象は `${id}.${timestamp}.${body}`、値は `v1,<base64(HMAC-SHA256)>`。

export const SECRET_PREFIX = "whsec_";

export function generateWebhookSecret(): string {
  return SECRET_PREFIX + randomBytes(32).toString("base64");
}

function keyBytes(secret: string): Buffer {
  return Buffer.from(
    secret.startsWith(SECRET_PREFIX)
      ? secret.slice(SECRET_PREFIX.length)
      : secret,
    "base64",
  );
}

export function signWebhook(
  secret: string,
  messageId: string,
  timestampSec: number,
  body: string,
): string {
  const mac = createHmac("sha256", keyBytes(secret))
    .update(`${messageId}.${timestampSec}.${body}`)
    .digest("base64");
  return `v1,${mac}`;
}

export function webhookHeaders(
  secret: string,
  messageId: string,
  timestampSec: number,
  body: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "user-agent": "ckk-webhook/1",
    "webhook-id": messageId,
    "webhook-timestamp": String(timestampSec),
    "webhook-signature": signWebhook(secret, messageId, timestampSec, body),
  };
}

/** 本文の指紋（ログ・試験用。署名ではない）。 */
export function bodyDigest(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

// ── 再試行 ───────────────────────────────────────────────────────────────

/** 試行の間隔（秒）。i 番目は「i+1 回目の失敗の後に待つ時間」。合計は約 33 時間。 */
export const RETRY_DELAYS_SEC: readonly number[] = [
  30, 120, 600, 3_600, 21_600, 86_400,
];
/** 初回 + 再試行。これを超えたら FAILED で打ち切る。 */
export const MAX_ATTEMPTS = RETRY_DELAYS_SEC.length + 1;
/** 打ち切りがこの回数連続したら送信先を自動で無効化する。 */
export const AUTO_DISABLE_AFTER = 5;

/** `attempts`（これまでの試行回数、失敗後に +1 済み）→ 次の試行までの秒。尽きたら null。 */
export function nextDelaySec(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_SEC[attempts - 1] ?? null;
}

/** 2xx だけが成功。3xx は**追わず**失敗（リダイレクトで宛先をすり替えさせない）。 */
export function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

/** 再試行しても直らない応答（URL や認可の誤り）。それでも回数までは試す — 相手側の設定直しを待てるため。 */
export function summarizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, " ").slice(0, 300);
}

// ── 送信先 URL の検証（SSRF の入口）──────────────────────────────────────

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Parts(host: string): [number, number, number, number] | null {
  const m = IPV4.exec(host);
  if (!m) return null;
  const p = m.slice(1, 5).map(Number) as [number, number, number, number];
  return p.every((n) => n >= 0 && n <= 255) ? p : null;
}

/**
 * 送ってはいけないアドレス: ループバック・リンクローカル（クラウドの
 * メタデータ 169.254.169.254 を含む）・未指定。
 * **プライベート（RFC1918）は許す** — n8n は同じ Docker ネットワーク / LAN に
 * 居るのが普通で、この画面は特権操作で守られている。
 * IPv6 は `::1` / `::` / `fe80::/10` / IPv4 射影（`::ffff:a.b.c.d`）の検査のみ。
 */
export function isBlockedAddress(addr: string): boolean {
  const a = addr.toLowerCase().replace(/^\[|\]$/g, "");
  const v4 = ipv4Parts(a);
  if (v4) {
    const [o1, o2] = v4;
    if (o1 === 127 || o1 === 0) return true;
    if (o1 === 169 && o2 === 254) return true;
    return false;
  }
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fe8") || a.startsWith("fe9")) return true;
  if (a.startsWith("fea") || a.startsWith("feb")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped?.[1]) return isBlockedAddress(mapped[1]);
  return false;
}

function isPrivateHost(host: string): boolean {
  const v4 = ipv4Parts(host);
  if (v4) {
    const [o1, o2] = v4;
    return (
      o1 === 10 ||
      (o1 === 172 && o2 >= 16 && o2 <= 31) ||
      (o1 === 192 && o2 === 168)
    );
  }
  if (host.includes(":")) return false; // IPv6 リテラルの http は許さない
  // 単一ラベル（Docker のエイリアス `n8n`）と社内ドメイン。
  return (
    !host.includes(".") ||
    host.endsWith(".loc") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan")
  );
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/**
 * 送信先 URL の検証。**保存時と送信時の両方**で通す（保存後に DNS が変わっても
 * 送信時の `isBlockedAddress` が最後の砦になる — dispatcher を参照）。
 *
 * - `https:` はどのホストでも可（ブロック対象を除く）
 * - `http:` は社内（RFC1918 / `.loc` / 単一ラベル）のみ。平文で外へ出さない
 * - URL に資格情報（`user:pass@`）を埋めない — ログ・画面に漏れる
 */
export function validateWebhookUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "only http(s) is allowed" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "credentials in the URL are not allowed" };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return { ok: false, error: "host is empty" };
  if (BLOCKED_HOSTNAMES.has(host) || isBlockedAddress(host)) {
    return { ok: false, error: "this host is not allowed" };
  }
  if (url.protocol === "http:" && !isPrivateHost(host)) {
    return {
      ok: false,
      error: "http is only allowed for internal hosts; use https",
    };
  }
  return { ok: true, url };
}
