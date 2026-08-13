/**
 * last-page.ts — ユーザーごとの「最後に開いたページ」（localStorage・端末ローカル）。
 *
 * 再ログイン時にそのページへ直行させる（共有端末での作業再開を速くする）。
 * 保存はページ遷移ごと（LastPageTracker）、復元はログイン成功時（/login）。
 * サーバーには保存しない — あくまでこの端末のこのブラウザ内の利便機能。
 *
 * キー:
 *   kiosk:activeUser        — 現在ログイン中の userId（ログイン成功時に設定）
 *   kiosk:lastPage:<userId> — そのユーザーが最後に開いていた pathname
 */

const ACTIVE_USER_KEY = "kiosk:activeUser";
const LAST_PAGE_PREFIX = "kiosk:lastPage:";

/** 追跡・復元対象のパスか（ログイン/セットアップ/端末系画面は対象外）。 */
export function isTrackablePath(pathname: string): boolean {
  if (!pathname.startsWith("/")) return false;
  if (pathname.startsWith("//")) return false; // プロトコル相対 URL を弾く
  const excluded = ["/login", "/setup", "/device-error", "/device-settings"];
  return !excluded.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** ログイン成功時: アクティブユーザーを記録し、復元先パスを返す。 */
export function beginUserPageTracking(userId: string): string {
  const store = storage();
  if (!store) return "/";
  try {
    store.setItem(ACTIVE_USER_KEY, userId);
    const saved = store.getItem(LAST_PAGE_PREFIX + userId);
    return saved && isTrackablePath(saved) ? saved : "/";
  } catch {
    return "/";
  }
}

/** ページ遷移ごと: アクティブユーザーの最終ページを更新（対象外パスでは何もしない）。 */
export function trackPage(pathname: string): void {
  if (!isTrackablePath(pathname)) return;
  const store = storage();
  if (!store) return;
  try {
    const userId = store.getItem(ACTIVE_USER_KEY);
    if (userId) store.setItem(LAST_PAGE_PREFIX + userId, pathname);
  } catch {
    // localStorage 不可（プライベートモード等）— 追跡なしで続行
  }
}

/** ログイン画面表示時: 追跡を停止する（次のログインまで保存しない）。 */
export function stopUserPageTracking(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(ACTIVE_USER_KEY);
  } catch {
    // no-op
  }
}
