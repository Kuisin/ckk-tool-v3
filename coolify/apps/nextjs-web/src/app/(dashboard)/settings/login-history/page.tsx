import { getTranslations } from "next-intl/server";
import { LoginHistoryView } from "@/components/settings/security/LoginHistoryView";
import { requireAppRead } from "@/lib/authz-page";
import {
  getLoginAttemptSummary,
  listLoginAttempts,
} from "@/lib/login-attempts";

export const dynamic = "force-dynamic";

/**
 * ログイン履歴（SY0D）— Web / キオスク両方の認証イベント。system 権限（READ）。
 *
 * 絞り込みは**サーバー側**でやる（SY07 操作履歴のように全件を持ってきて
 * クライアントで絞る方式は取らない）。認証イベントは 1 日で数千行になりうるし、
 * IP の CIDR 絞り込みは inet の `<<=` に落としたいため。
 */
export default async function LoginHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const denied = await requireAppRead("login-history");
  if (denied) return denied;

  const sp = await searchParams;
  const one = (key: string): string | null => {
    const v = sp[key];
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.length > 0 ? s : null;
  };

  const days = Number(one("days") ?? "7");
  const filter = {
    days: Number.isFinite(days) && days > 0 && days <= 400 ? days : 7,
    outcome: one("outcome") as "SUCCESS" | "FAILURE" | null,
    // 「アプリ」の絞り込みは面（Web / 共有端末 / 取引先ポータル）。
    // ポータルは app 列では区別できない（nextjs-web が配信しているので WEB）。
    surface: one("app") as "WEB" | "KIOSK" | "PORTAL" | null,
    ip: one("ip"),
    fingerprint: one("fp"),
    ownership: one("own") as never,
    reason: one("reason"),
  };

  const tr = await getTranslations();
  const [{ rows, nextCursor }, summary] = await Promise.all([
    listLoginAttempts(filter),
    getLoginAttemptSummary(tr),
  ]);

  return (
    <LoginHistoryView
      hasMore={nextCursor !== null}
      rows={rows}
      summary={summary}
    />
  );
}
