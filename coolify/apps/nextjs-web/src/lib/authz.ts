/**
 * authz.ts — RBAC 強制（web アダプタ）。server-only.
 *
 * 判定ロジックは @ckk/authz-core（両アプリ共通・純粋・単体テスト済み）。
 * このファイルは Auth.js セッション解決 + React cache() によるリクエスト
 * 単位メモ化 + 既存 API（AuthzResult）互換の薄いアダプタ。
 *
 * 使い方 — 全 mutating Server Action / Route Handler の先頭で:
 *   const authz = await checkPermission("quote", "CREATE");
 *   if (!authz.ok) return actionError(authz.error);
 *
 * 規約:
 * - ACTION は要求アクション or ADMIN のどちらかを持てば許可。
 * - permission_code "system" の ADMIN はスーパーユーザー（全コード許可）。
 * - スコープ: checkPermission は access（ALL / 拠点集合+OWN）も返す。
 *   行レベル絞り込みは各機能が access-where ヘルパで適用する（未適用の
 *   機能は従来通り ok だけ見ればよい）。
 */

import {
  type Access,
  type AppPermissionRef,
  buildPermissionSet,
  decide,
  loadPermissionRows,
  loadScopeContext,
  type PermissionAction,
  type PermissionSet,
  readableCodes,
  type ScopeContext,
  visibleAppKeys,
} from "@ckk/authz-core";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./db";
import { actionLabel, permissionLabel } from "./permission-labels";

export type { Access, PermissionAction, ScopeContext };

export type AuthzResult =
  | { ok: true; userId: string; access: Access }
  | { ok: false; error: string };

/** セッションのユーザー id（未ログインは null）。 */
export async function sessionUserId(): Promise<string | null> {
  try {
    const session = await auth();
    return (session?.user as { id?: string } | undefined)?.id ?? null;
  } catch {
    return null; // リクエスト外（ビルド・ポーラー）
  }
}

/** ユーザーの権限集合（リクエスト単位でメモ化 — 1 クエリ）。 */
const permissionSetFor = cache(
  async (userId: string): Promise<PermissionSet> =>
    buildPermissionSet(await loadPermissionRows(prisma, userId)),
);

/** スコープ解決コンテキスト（リクエスト単位でメモ化 — 1 クエリ）。 */
const scopeContextFor = cache(
  async (userId: string): Promise<ScopeContext> =>
    loadScopeContext(prisma, userId),
);

/** セッションユーザーの権限集合（未ログインは null）。 */
export async function getPermissionSet(): Promise<PermissionSet | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  return permissionSetFor(userId);
}

/** セッションユーザーのスコープ解決コンテキスト（未ログインは null）。 */
export async function getScopeContext(): Promise<ScopeContext | null> {
  const userId = await sessionUserId();
  if (!userId) return null;
  return scopeContextFor(userId);
}

/**
 * permission_code × action の権限チェック。
 * 成功時は実効アクセス（access）も返す — スコープ未対応の呼び出し側は
 * これまで通り ok / userId / error だけ見れば挙動不変。
 */
export async function checkPermission(
  code: string,
  action: PermissionAction,
): Promise<AuthzResult> {
  const userId = await sessionUserId();
  if (!userId) {
    const tr = await getTranslations();
    return { ok: false, error: tr("common.loginRequired") };
  }

  const [set, ctx] = await Promise.all([
    permissionSetFor(userId),
    scopeContextFor(userId),
  ]);
  const decision = decide(set, ctx, code, action);
  if (decision.allowed) {
    return { ok: true, userId, access: decision.access };
  }
  // 文言（翻訳カタログ・locale）は**拒否したときだけ**引く。ここはほぼ全ページ・
  // 全 Server Action の先頭で通る道で、通る側（大多数）に文言は要らない。
  // コードだけを見せても「何を頼めばいいのか」が分からないので、名前つきで返す。
  // 括弧のコードは残す — 管理者への問い合わせではコードで指定されることがある。
  const [tr, locale] = await Promise.all([getTranslations(), getLocale()]);
  return {
    ok: false,
    error: tr("common.permissionActionDenied", {
      permission: permissionLabel(code, locale),
      action: actionLabel(action, locale),
      code,
      actionCode: action,
    }),
  };
}

/**
 * 承認・差し戻し操作の RBAC 門番 — **書類を閲覧（READ）または編集（UPDATE）
 * できればよい**。承認そのものの可否は権限アクションではなく、承認設定
 * （MS0B）の承認グループ所属だけが決める（lib/approvals.ts resolveApprover）。
 *
 * 旧: `<code>:APPROVE` を要求していたが、承認できる人の管理が RBAC と MS0B の
 * 2 箇所に割れて運用事故のもとだったため、承認の管理は MS0B に一本化した。
 * スコープ（access）は一致した方（READ 優先）のものを返す — 呼び出し側の
 * *InScope 判定は「その書類が見える範囲か」で従来どおり働く。
 */
export async function checkApprovalDocAccess(
  code: string,
): Promise<AuthzResult> {
  const read = await checkPermission(code, "READ");
  if (read.ok) return read;
  const update = await checkPermission(code, "UPDATE");
  if (update.ok) return update;
  const [tr, locale] = await Promise.all([getTranslations(), getLocale()]);
  return {
    ok: false,
    error: tr("common.permissionReadOrUpdateDenied", {
      permission: permissionLabel(code, locale),
      code,
    }),
  };
}

/**
 * 「いずれかのコードの READ を持っていれば可」の門 — 検索ピッカーなど、
 * 複数の業務画面から共有される読み取り専用の Server Action 用。
 *
 * ピッカーは書類を作る人が参照マスタを引くためのもので、master:READ を
 * 持たない営業担当も顧客を選べなければならない。だから「この一覧を使う
 * 画面のどれかを読める人」を通す。ロールを 1 つも持たない（SSO で自動作成
 * されただけの）アカウントはここで止まる — 2026-09 の監査で、この門が
 * 無かったために取引先・製品・利用者・注文明細の一覧がログインだけで
 * 引けていた（scripts/check-server-action-gates.mjs が再発を止める）。
 *
 * 行レベルのスコープ（拠点 / OWN）は掛けない — 書類を起こすときの参照は
 * 全件でよく、掛けると他拠点の顧客宛ての書類が作れなくなる。
 */
export async function requireAnyRead(
  codes: readonly string[],
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const userId = await sessionUserId();
  if (!userId) {
    const tr = await getTranslations();
    return { ok: false, error: tr("common.loginRequired") };
  }
  const readable = readableCodes(await permissionSetFor(userId));
  if (readable.has("*") || codes.some((c) => readable.has(c))) {
    return { ok: true, userId };
  }
  const tr = await getTranslations();
  return { ok: false, error: tr("common.permissionAnyReadDenied") };
}

/** Route Handler 用: 失敗時に 401/403 Response を返す。成功時 null。 */
export async function requirePermissionResponse(
  code: string,
  action: PermissionAction,
): Promise<Response | null> {
  const res = await checkPermission(code, action);
  if (res.ok) return null;
  // 文言は locale で変わるので前綴りでは判定しない — 未ログインかどうかを
  // 元の判定条件で直接確かめる（sessionUserId は cache() 済みで安い）。
  const status = (await sessionUserId()) ? 403 : 401;
  return Response.json({ error: res.error }, { status });
}

/**
 * READ 可能な permission code 集合（アプリ可視性フィルタ用）。
 * superuser は番兵 "*" を含む。未ログインは空集合。
 */
export async function getReadableCodes(): Promise<ReadonlySet<string>> {
  const set = await getPermissionSet();
  return set ? readableCodes(set) : new Set<string>();
}

/** アプリ一覧 → 表示してよい key 集合（requiredPermission=null は常時可視）。 */
export async function getVisibleAppKeys<T extends AppPermissionRef>(
  apps: readonly T[],
): Promise<Set<string>> {
  const set = await getPermissionSet();
  if (!set) return new Set<string>();
  return visibleAppKeys(set, apps);
}
