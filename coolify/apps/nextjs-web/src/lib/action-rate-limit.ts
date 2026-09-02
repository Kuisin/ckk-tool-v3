/**
 * action-rate-limit.ts — 認証済み利用者の「連打」を止めるだけの軽い制限。
 *
 * 通知の一斉送信（ページ共有）やバグ報告のように、ログインしていれば誰でも
 * 呼べて、相手が全社員になりうる Server Action 用（監査 L4）。auth.ts の
 * ログイン失敗カウンタと同じインメモリ Map — 単一コンテナ運用で十分で、
 * プロセス再起動で消えてよい種類の状態。ポータルのような未認証の口には
 * 使わない（あちらは DB 保存の portal-rate-limit.ts）。
 */

import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

const globalBuckets = globalThis as unknown as {
  __actionRateLimits?: Map<string, Bucket>;
};
if (!globalBuckets.__actionRateLimits) {
  globalBuckets.__actionRateLimits = new Map<string, Bucket>();
}
const buckets = globalBuckets.__actionRateLimits;

/**
 * `key`（"share:<userId>" など）が `windowMs` の間に `max` 回を超えたら false。
 * 超えなければ数えて true。
 */
export function takeActionToken(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
): boolean {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= max) return false;
  current.count += 1;
  return true;
}
