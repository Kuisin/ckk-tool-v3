/**
 * portal-access-core.ts — 取引先ポータルの認可判定（純関数・テスト対象）。
 *
 * 考え方は share-grants-core.ts と同じ: **当てはまる行の和集合**。1 行でも
 * 権限を与えていれば与える（否定行は持たない）。行が 1 つ増えて見える範囲が
 * 減ることは無い。
 *
 * RBAC（@ckk/authz-core）とは別立て。あちらは「社員がそのアプリを使えるか」を
 * 決めるもので、ポータルの主体はそもそも app.users ではない。ここが決めるのは
 * 「この社外の人に、この 1 件を見せてよいか」だけ。
 *
 * ★ 見落としがちな不変条件
 *   - 支店に紐づくアカウントは**親へ遡らない**（下向きだけ）。本社や他支店の
 *     書類が見えてはいけない。展開は lib/portal-access.ts の expandBpScope が
 *     行い、ここへは展開済みの集合が渡る。
 *   - DOCUMENT の付与は BP 一致を要求しない（「指定された 1 件だけ」の意味）。
 *   - 需要家・出荷先としての一致は **includeAsEndUser の付与だけ**が見る。
 */

export const PORTAL_RESOURCE_TYPES = [
  "quotes",
  "order_acceptances",
  "delivery_notes",
  "invoices",
  "order_lines",
  "forms",
] as const;

export type PortalResourceType = (typeof PORTAL_RESOURCE_TYPES)[number];

export function isPortalResourceType(v: string): v is PortalResourceType {
  return (PORTAL_RESOURCE_TYPES as readonly string[]).includes(v);
}

export const PORTAL_GRANT_KINDS = ["BP_SCOPE", "DOCUMENT", "FORM"] as const;
export type PortalGrantKind = (typeof PORTAL_GRANT_KINDS)[number];

/** 回答の絞り込み（FORM のみ）。share_grants の ShareCondition と同じ規約。 */
export interface PortalCondition {
  fieldKey: string;
  values: readonly string[];
}

export interface PortalGrantRow {
  kind: string;
  /** BP_SCOPE の対象。**呼び出し側で支店まで展開済みの集合**を渡す。 */
  bpIds?: readonly string[];
  includeAsEndUser?: boolean;
  resourceType?: string | null;
  resourceId?: string | null;
  condition?: PortalCondition | null;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
}

export interface PortalSubject {
  accountId: string;
  /** 管理者が有効化していなければ、行を 1 つも見ずに全拒否。 */
  isActive: boolean;
}

export interface PortalTarget {
  type: PortalResourceType;
  /** 業務キー（QOT-… / ORD-… / DRN-… / INV-… / forms.code）。 */
  id: string;
  /** その書類が「宛て先」として持つ BP（顧客・その支店）。 */
  customerBpIds?: readonly string[];
  /** 需要家・出荷先として持つ BP。 */
  endUserBpIds?: readonly string[];
}

export type PortalDenyReason =
  | "INACTIVE"
  | "NO_GRANT"
  | "GRANT_EXPIRED"
  | "OUT_OF_SCOPE"
  | "UNKNOWN_KIND";

export interface PortalAccess {
  canView: boolean;
  reason: PortalDenyReason | null;
  /**
   * 回答の絞り込み（FORM のみ）。`all` なら全件、そうでなければ conditions の
   * いずれかに当たるものだけ。share_grants の ResponseScope と同じ形なので、
   * 判定には share-grants-core.ts の responseInScope をそのまま使える。
   */
  responseScope: { all: boolean; conditions: PortalCondition[] };
}

const DENY = (reason: PortalDenyReason): PortalAccess => ({
  canView: false,
  reason,
  responseScope: { all: false, conditions: [] },
});

/** 有効な行か（期限切れ・失効を落とす）。 */
function isLive(now: Date, row: PortalGrantRow): boolean {
  if (row.revokedAt) return false;
  if (row.expiresAt && now.getTime() >= row.expiresAt.getTime()) return false;
  return true;
}

function intersects(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  if (!a?.length || !b?.length) return false;
  const set = new Set(a);
  return b.some((v) => set.has(v));
}

/** その行がこの対象に当てはまるか。未知の kind は false（fail-closed）。 */
function matches(row: PortalGrantRow, target: PortalTarget): boolean {
  switch (row.kind) {
    case "BP_SCOPE": {
      // フォームは BP で宛て先が決まらないので BP_SCOPE では出さない。
      if (target.type === "forms") return false;
      if (intersects(row.bpIds, target.customerBpIds)) return true;
      // 需要家・出荷先としての一致は、明示的に許可した付与だけが見る。
      if (row.includeAsEndUser && intersects(row.bpIds, target.endUserBpIds))
        return true;
      return false;
    }
    case "DOCUMENT":
      // **BP 一致は要求しない** —「指定された 1 件だけ」を表すため。
      return row.resourceType === target.type && row.resourceId === target.id;
    case "FORM":
      return target.type === "forms" && row.resourceId === target.id;
    default:
      return false;
  }
}

/** 見える範囲を広げる（狭めない）。share-grants-core.ts の widen と同じ規則。 */
function widen(
  scope: PortalAccess["responseScope"],
  condition: PortalCondition | null | undefined,
): PortalAccess["responseScope"] {
  if (scope.all) return scope;
  if (!condition || condition.values.length === 0)
    return { all: true, conditions: [] };
  return { all: false, conditions: [...scope.conditions, condition] };
}

/**
 * この対象を見せてよいか。
 *
 * 拒否の理由は監査・調査のために区別するが、**画面の文言は区別しない**
 * （存在するものと存在しないものが見分けられてしまう）。
 */
export function resolvePortalAccess(
  now: Date,
  grants: readonly PortalGrantRow[],
  subject: PortalSubject,
  target: PortalTarget,
): PortalAccess {
  if (!subject.isActive) return DENY("INACTIVE");

  let sawKnownKind = false;
  let sawLiveRow = false;
  let matched = false;
  let scope: PortalAccess["responseScope"] = { all: false, conditions: [] };

  for (const row of grants) {
    const known = (PORTAL_GRANT_KINDS as readonly string[]).includes(row.kind);
    if (known) sawKnownKind = true;
    if (!isLive(now, row)) continue;
    sawLiveRow = true;
    if (!known) continue;
    if (!matches(row, target)) continue;
    matched = true;
    // FORM だけが絞り込みを持つ。BP_SCOPE / DOCUMENT は全件見える。
    scope =
      row.kind === "FORM"
        ? widen(scope, row.condition)
        : { all: true, conditions: [] };
  }

  if (matched) return { canView: true, reason: null, responseScope: scope };
  if (grants.length === 0) return DENY("NO_GRANT");
  if (!sawKnownKind) return DENY("UNKNOWN_KIND");
  if (!sawLiveRow) return DENY("GRANT_EXPIRED");
  return DENY("OUT_OF_SCOPE");
}

/**
 * 一覧を引くための材料（N+1 を避けるため、WHERE に落とせる形で返す）。
 *
 * 1 件ずつ resolvePortalAccess を呼ぶのではなく、この集合で SQL を絞り、
 * 詳細ページで改めて resolvePortalAccess を通す（二重に守る）。
 */
export interface PortalScope {
  /** customer_bp_id / customer_branch_bp_id に当てる集合。 */
  customerBpIds: string[];
  /** end_user_bp_id / ship_to_bp_id に当てる集合（includeAsEndUser の分だけ）。 */
  endUserBpIds: string[];
  /** 個別付与された書類の業務キー。 */
  documentIds: Map<PortalResourceType, Set<string>>;
}

export function portalScopeBpIds(
  now: Date,
  grants: readonly PortalGrantRow[],
  subject: PortalSubject,
): PortalScope {
  const empty: PortalScope = {
    customerBpIds: [],
    endUserBpIds: [],
    documentIds: new Map(),
  };
  if (!subject.isActive) return empty;

  const customer = new Set<string>();
  const endUser = new Set<string>();
  const documents = new Map<PortalResourceType, Set<string>>();

  for (const row of grants) {
    if (!isLive(now, row)) continue;
    if (row.kind === "BP_SCOPE") {
      for (const id of row.bpIds ?? []) {
        customer.add(id);
        if (row.includeAsEndUser) endUser.add(id);
      }
      continue;
    }
    if (row.kind === "DOCUMENT" || row.kind === "FORM") {
      const type =
        row.kind === "FORM" ? "forms" : (row.resourceType ?? undefined);
      if (!type || !isPortalResourceType(type)) continue;
      if (!row.resourceId) continue;
      const set = documents.get(type) ?? new Set<string>();
      set.add(row.resourceId);
      documents.set(type, set);
    }
  }

  return {
    customerBpIds: [...customer],
    endUserBpIds: [...endUser],
    documentIds: documents,
  };
}
