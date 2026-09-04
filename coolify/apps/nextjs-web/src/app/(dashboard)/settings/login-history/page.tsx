import { getTranslations } from "next-intl/server";
import { LoginHistoryView } from "@/components/settings/security/LoginHistoryView";
import { requireAppRead } from "@/lib/authz-page";
import {
  getLoginAttemptSummary,
  listLoginAttempts,
} from "@/lib/login-attempts";
import {
  parseDeviceOwnership,
  parseLoginHistoryDays,
  parseLoginOutcome,
  parseLoginSurface,
} from "@/lib/login-history-filter-core";

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

  // enum 列に落ちる値はクエリをそのまま信用せず許可リストで濾す — 外れた値を
  // Prisma に渡すと PrismaClientValidationError で 500 になる（days と同じ扱い）。
  const filter = {
    days: parseLoginHistoryDays(one("days")),
    outcome: parseLoginOutcome(one("outcome")),
    // 「アプリ」の絞り込みは面（Web / 共有端末 / 取引先ポータル）。
    // ポータルは app 列では区別できない（nextjs-web が配信しているので WEB）。
    surface: parseLoginSurface(one("app")),
    ip: one("ip"),
    fingerprint: one("fp"),
    ownership: parseDeviceOwnership(one("own")),
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
